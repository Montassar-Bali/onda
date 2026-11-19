import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Event, TicketCategory } from "@prisma/client";
import { advisoryLock, prisma, tx, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { newManualCode, newQrToken, normalizeManualCode } from "@/lib/tokens";
import { personSchema, uuid, type PersonInput } from "@/lib/validation";
import { assertDistinctCins, upsertIdentity } from "./identity";
import { emailTickets } from "./notifications";
import { loadSellableEvent, requireEventAccess, requireLeader, requireSalesPointMember } from "./guards";
import type { Actor } from "./types";

// ───────────────────────────── shared primitives ─────────────────────────────

/** Locks taken in a fixed order to avoid deadlocks: event capacity → identities (sorted). */
export const capacityLockKey = (eventId: string) => `event-capacity:${eventId}`;

/** Atomically consumes paid inventory (event + category). Fails if it would oversell. */
export async function consumePaidInventory(t: Tx, eventId: string, categoryId: string, n: number) {
  const ev = await t.$executeRaw`
    UPDATE events SET paid_sold_count = paid_sold_count + ${n}
    WHERE id = ${eventId}::uuid AND status = 'PUBLISHED' AND paid_sold_count + ${n} <= paid_ticket_capacity`;
  if (ev !== 1) throw conflict("SOLD_OUT", "Not enough paid tickets remaining for this event");
  const cat = await t.$executeRaw`
    UPDATE ticket_categories SET sold_count = sold_count + ${n}
    WHERE id = ${categoryId}::uuid AND event_id = ${eventId}::uuid AND active
      AND (capacity IS NULL OR sold_count + ${n} <= capacity)`;
  if (cat !== 1) throw conflict("CATEGORY_SOLD_OUT", "Not enough tickets remaining in this category");
}

/** Enforces the per-event maximum tickets per identity (paid + complimentary entitlements). */
export async function assertIdentityLimit(t: Tx, event: Event, identityId: string, adding: number) {
  await advisoryLock(t, `identity:${event.id}:${identityId}`);
  const held = await t.ticket.count({
    where: { eventId: event.id, holderIdentityId: identityId, admissionStatus: { in: ["VALID", "CHECKED_IN"] } },
  });
  if (held + adding > event.maxTicketsPerIdentity) {
    throw conflict("IDENTITY_LIMIT", `This national ID already holds ${held} ticket(s); the limit for this event is ${event.maxTicketsPerIdentity}`);
  }
}

export async function getOrCreateAccount(t: Tx, sellerId: string, eventId: string) {
  return t.sellerCashAccount.upsert({
    where: { sellerId_eventId: { sellerId, eventId } },
    create: { sellerId, eventId },
    update: {},
  });
}

const digitalSerial = (event: Event) => `${event.id.slice(0, 4).toUpperCase()}-D-${randomBytes(4).toString("hex").toUpperCase()}`;

async function loadCategory(t: Tx, eventId: string, categoryId: string): Promise<TicketCategory> {
  const c = await t.ticketCategory.findFirst({ where: { id: categoryId, eventId, active: true } });
  if (!c) throw notFound("Ticket category not found for this event");
  return c;
}

export interface Warning { code: string; message: string }

/** A scanned QR token or a typed manual code → the unique field to look the ticket up by. */
export function ticketRef(input: string): { qrToken: string } | { manualCode: string } {
  const trimmed = input.trim();
  const code = normalizeManualCode(trimmed);
  return code ? { manualCode: code } : { qrToken: trimmed };
}

// ───────────────────────────── digital cash sale ─────────────────────────────

export const digitalSaleInput = z.object({
  eventId: uuid,
  categoryId: uuid,
  /** One entry per attendee: identity of EACH ticket holder is mandatory. */
  holders: z.array(personSchema).min(1).max(20),
  /** Person paying, if different from the holders. Defaults to the first holder. */
  purchaser: personSchema.optional().nullable(),
  salesPointId: uuid.optional().nullable(),
  /** Seller must explicitly confirm the cash was physically collected. */
  cashCollected: z.literal(true, { error: "You must confirm that the cash was collected" }),
  /** Price the seller saw on screen; sale is refused if it no longer matches the official price. */
  expectedUnitPriceMillimes: z.number().int().positive(),
});

/**
 * Normal digital ticket sale (spec §3). Everything — identity, inventory, ticket, payment
 * record, seller liability, audit — happens in ONE transaction. Any failure rolls back all of it.
 */
export async function sellDigitalTickets(actor: Actor, raw: unknown) {
  const d = digitalSaleInput.parse(raw);
  assertDistinctCins(d.holders);
  await requireEventAccess(actor, d.eventId);
  if (d.salesPointId) await requireSalesPointMember(actor, d.salesPointId);

  const result = await tx(async (t) => {
    const event = await loadSellableEvent(t, d.eventId);
    const category = await loadCategory(t, d.eventId, d.categoryId);
    if (category.priceMillimes !== d.expectedUnitPriceMillimes) {
      throw conflict("PRICE_CHANGED", "The official price changed. Reload and confirm the new price before collecting cash.");
    }
    await advisoryLock(t, capacityLockKey(event.id));

    const warnings: Warning[] = [];
    const purchaser = d.purchaser ? await upsertIdentity(t, d.purchaser, event.endsAt) : null;
    const holders = await resolveHolders(t, event, d.holders, warnings);
    await consumePaidInventory(t, event.id, category.id, holders.length);
    const account = await getOrCreateAccount(t, actor.id, event.id);

    const ticketIds: string[] = [];
    for (const h of holders) {
      const ticket = await t.ticket.create({
        data: {
          eventId: event.id, categoryId: category.id, kind: "DIGITAL",
          serial: digitalSerial(event), qrToken: newQrToken(), manualCode: newManualCode(),
          inventoryStatus: "SOLD", paymentStatus: "CASH_REPORTED_COLLECTED", admissionStatus: "VALID",
          priceMillimes: category.priceMillimes,
          holderIdentityId: h.id, purchaserIdentityId: purchaser?.identity.id ?? holders[0].id,
          soldById: actor.id, soldAt: new Date(), salesPointId: d.salesPointId ?? null,
        },
      });
      await recordCashSale(t, actor, { ticketId: ticket.id, eventId: event.id, accountId: account.id, customerId: h.id, amount: category.priceMillimes, salesPointId: d.salesPointId ?? null });
      await t.ticketInventoryMovement.create({
        data: { ticketId: ticket.id, actorId: actor.id, action: "SOLD", toInventory: "SOLD", toPayment: "CASH_REPORTED_COLLECTED", toAdmission: "VALID" },
      });
      ticketIds.push(ticket.id);
    }
    await audit(t, actor.id, "DIGITAL_SALE", "event", event.id, { ticketIds, categoryId: category.id, unitPriceMillimes: category.priceMillimes, count: ticketIds.length, salesPointId: d.salesPointId ?? null }, actor.ip);
    return { ticketIds, totalMillimes: category.priceMillimes * ticketIds.length, warnings };
  });

  const emails = await emailTickets(result.ticketIds);
  return { ...result, emails };
}

async function resolveHolders(t: Tx, event: Event, people: PersonInput[], warnings: Warning[]) {
  const ids: { id: string }[] = [];
  const resolved = [];
  for (const p of people) {
    const r = await upsertIdentity(t, p, event.endsAt);
    if (r.nameMismatch) warnings.push({ code: "NAME_MISMATCH", message: `National ID ending ${p.cin.slice(-3)} is registered under a different name (${r.storedName}). Verify the ID card.` });
    resolved.push(r.identity);
  }
  // Lock identities in a stable order to avoid deadlocks between concurrent sales.
  for (const idn of [...resolved].sort((a, b) => a.id.localeCompare(b.id))) {
    await assertIdentityLimit(t, event, idn.id, resolved.filter((x) => x.id === idn.id).length);
  }
  for (const r of resolved) ids.push({ id: r.id });
  return ids;
}

/** Appends the SALE to the cash ledger and increases the seller's liability. */
async function recordCashSale(t: Tx, actor: Actor, p: { ticketId: string; eventId: string; accountId: string; customerId: string; amount: number; salesPointId: string | null }) {
  await t.cashTransaction.create({
    data: {
      type: "SALE", eventId: p.eventId, ticketId: p.ticketId, sellerId: actor.id, salesPointId: p.salesPointId,
      customerId: p.customerId, accountId: p.accountId, amountMillimes: p.amount, reportedById: actor.id,
    },
  });
  await t.sellerCashAccount.update({ where: { id: p.accountId }, data: { expectedMillimes: { increment: p.amount } } });
}

// ───────────────────────────── physical ticket activation ─────────────────────────────

/** Read-only preview so the seller sees the official price BEFORE collecting cash. */
export async function previewPhysicalTicket(actor: Actor, qrToken: string) {
  const tk = await prisma.ticket.findUnique({ where: ticketRef(qrToken), include: { event: true, category: true, assignedSalesPoint: true } });
  if (!tk || tk.kind !== "PHYSICAL") throw notFound("Unknown physical ticket");
  await requireEventAccess(actor, tk.eventId);
  const canSell = await canSellPhysical(actor, tk);
  return {
    ticketId: tk.id, serial: tk.serial, event: { id: tk.eventId, name: tk.event.name }, category: tk.category.name,
    priceMillimes: tk.category.priceMillimes, inventoryStatus: tk.inventoryStatus,
    assignedToYou: canSell.ok, reason: canSell.ok ? null : canSell.reason,
  };
}

async function canSellPhysical(actor: Actor, tk: { inventoryStatus: string; assignedSellerId: string | null; assignedSalesPointId: string | null }, t: Tx | typeof prisma = prisma): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (tk.inventoryStatus === "SOLD") return { ok: false, reason: "Ticket already sold" };
  if (tk.inventoryStatus === "VOID") return { ok: false, reason: "Ticket is void" };
  if (tk.inventoryStatus === "RETURNED") return { ok: false, reason: "Ticket was returned to central inventory" };
  if (tk.inventoryStatus !== "ASSIGNED") return { ok: false, reason: "Ticket is not assigned to any seller or sales point" };
  if (tk.assignedSellerId) {
    return tk.assignedSellerId === actor.id ? { ok: true } : { ok: false, reason: "Ticket is assigned to another seller (transfer required)" };
  }
  if (tk.assignedSalesPointId) {
    const m = await t.salesPointMember.findUnique({ where: { userId_salesPointId: { userId: actor.id, salesPointId: tk.assignedSalesPointId } } });
    return m ? { ok: true } : { ok: false, reason: "Ticket is assigned to another sales point (transfer required)" };
  }
  return { ok: false, reason: "Ticket has no valid assignment" };
}

export const activationInput = z.object({
  /** The scanned QR token, or the 12-character manual code typed from the ticket. */
  qrToken: z.string().min(12).max(100),
  holder: personSchema,
  purchaser: personSchema.optional().nullable(),
  cashCollected: z.literal(true, { error: "You must confirm that the cash was collected" }),
  expectedUnitPriceMillimes: z.number().int().positive(),
});

/**
 * Sells & activates a pre-printed physical ticket (spec §4). Row is locked FOR UPDATE and the
 * status change is conditional, so if two sellers activate the same QR only one succeeds; the
 * unique "one SALE per ticket" index is a final guarantee.
 */
export async function activatePhysicalTicket(actor: Actor, raw: unknown) {
  const d = activationInput.parse(raw);
  const result = await tx(async (t) => {
    const ref = ticketRef(d.qrToken);
    const rows = "manualCode" in ref
      ? await t.$queryRaw<{ id: string }[]>`SELECT id FROM tickets WHERE manual_code = ${ref.manualCode} FOR UPDATE`
      : await t.$queryRaw<{ id: string }[]>`SELECT id FROM tickets WHERE qr_token = ${ref.qrToken} FOR UPDATE`;
    if (rows.length === 0) throw notFound("Unknown ticket: check the QR code or the code typed in");
    const tk = await t.ticket.findUniqueOrThrow({ where: { id: rows[0].id } });
    if (tk.kind !== "PHYSICAL") throw invalid("NOT_PHYSICAL", "This QR code is not a pre-printed physical ticket");
    await requireEventAccess(actor, tk.eventId, t);
    const check = await canSellPhysical(actor, tk, t);
    if (!check.ok) throw (tk.inventoryStatus === "SOLD" ? conflict("ALREADY_SOLD", check.reason) : forbidden(check.reason));

    const event = await loadSellableEvent(t, tk.eventId);
    const category = await loadCategory(t, tk.eventId, tk.categoryId);
    if (category.priceMillimes !== d.expectedUnitPriceMillimes) throw conflict("PRICE_CHANGED", "The official price changed. Confirm the new price before collecting cash.");
    await advisoryLock(t, capacityLockKey(event.id));

    const warnings: Warning[] = [];
    const purchaser = d.purchaser ? await upsertIdentity(t, d.purchaser, event.endsAt) : null;
    const [holder] = await resolveHolders(t, event, [d.holder], warnings);
    await consumePaidInventory(t, event.id, category.id, 1);
    const account = await getOrCreateAccount(t, actor.id, event.id);
    const salesPointId = tk.assignedSalesPointId;

    const updated = await t.ticket.updateMany({
      where: { id: tk.id, inventoryStatus: "ASSIGNED", paymentStatus: "NOT_COLLECTED", admissionStatus: "NOT_ELIGIBLE" },
      data: {
        inventoryStatus: "SOLD", paymentStatus: "CASH_REPORTED_COLLECTED", admissionStatus: "VALID",
        priceMillimes: category.priceMillimes, holderIdentityId: holder.id, purchaserIdentityId: purchaser?.identity.id ?? holder.id,
        soldById: actor.id, soldAt: new Date(), salesPointId,
      },
    });
    if (updated.count !== 1) throw conflict("ALREADY_SOLD", "This ticket was activated by someone else");
    await recordCashSale(t, actor, { ticketId: tk.id, eventId: event.id, accountId: account.id, customerId: holder.id, amount: category.priceMillimes, salesPointId });
    await t.ticketInventoryMovement.create({
      data: {
        ticketId: tk.id, actorId: actor.id, action: "ACTIVATED",
        fromInventory: "ASSIGNED", toInventory: "SOLD", fromPayment: "NOT_COLLECTED", toPayment: "CASH_REPORTED_COLLECTED",
        fromAdmission: "NOT_ELIGIBLE", toAdmission: "VALID",
      },
    });
    await audit(t, actor.id, "PHYSICAL_ACTIVATION", "ticket", tk.id, { serial: tk.serial, priceMillimes: category.priceMillimes, salesPointId }, actor.ip);
    return { ticketId: tk.id, serial: tk.serial, totalMillimes: category.priceMillimes, warnings };
  });
  const emails = await emailTickets([result.ticketId]);
  return { ...result, emails };
}

// ───────────────────────────── complimentary tickets ─────────────────────────────

export const compInput = z.object({
  eventId: uuid,
  categoryId: uuid,
  holder: personSchema,
  reason: z.string().trim().min(5, "A documented reason is required").max(500),
});

export async function issueComplimentary(actor: Actor, raw: unknown) {
  requireLeader(actor);
  const d = compInput.parse(raw);
  const result = await tx(async (t) => {
    const event = await t.event.findUnique({ where: { id: d.eventId } });
    if (!event) throw notFound();
    if (event.status === "CANCELLED" || event.status === "CLOSED") throw invalid("EVENT_CLOSED", "Event is closed");
    await loadCategory(t, d.eventId, d.categoryId);
    await advisoryLock(t, capacityLockKey(event.id));
    const warnings: Warning[] = [];
    const [holder] = await resolveHolders(t, event, [d.holder], warnings);
    const n = await t.$executeRaw`
      UPDATE events SET comp_issued_count = comp_issued_count + 1
      WHERE id = ${event.id}::uuid AND comp_issued_count + 1 <= complimentary_allocation`;
    if (n !== 1) throw conflict("COMP_ALLOCATION_EXHAUSTED", "Complimentary allocation is exhausted");
    const ticket = await t.ticket.create({
      data: {
        eventId: event.id, categoryId: d.categoryId, kind: "COMPLIMENTARY",
        serial: `${event.id.slice(0, 4).toUpperCase()}-C-${randomBytes(4).toString("hex").toUpperCase()}`, qrToken: newQrToken(), manualCode: newManualCode(),
        inventoryStatus: "SOLD", paymentStatus: "NOT_COLLECTED", admissionStatus: "VALID", priceMillimes: 0,
        holderIdentityId: holder.id, purchaserIdentityId: holder.id, issuedById: actor.id, complimentaryReason: d.reason,
      },
    });
    await t.ticketInventoryMovement.create({ data: { ticketId: ticket.id, actorId: actor.id, action: "ISSUED_COMP", toInventory: "SOLD", toAdmission: "VALID", note: d.reason } });
    await audit(t, actor.id, "COMPLIMENTARY_ISSUED", "ticket", ticket.id, { reason: d.reason, eventId: event.id }, actor.ip);
    return { ticketId: ticket.id, warnings };
  });
  const emails = await emailTickets([result.ticketId]);
  return { ...result, emails };
}

// ───────────────────────────── reversal & reissue ─────────────────────────────

/** Team Leader-authorized cash reversal (refund). Only for unreconciled, unused tickets. */
export async function reverseSale(actor: Actor, ticketId: string, reason: string) {
  requireLeader(actor);
  if (reason.trim().length < 5) throw invalid("REASON_REQUIRED", "A reason is required");
  return tx(async (t) => {
    await t.$queryRaw`SELECT id FROM tickets WHERE id = ${ticketId}::uuid FOR UPDATE`;
    const tk = await t.ticket.findUnique({ where: { id: ticketId }, include: { cashTransactions: true } });
    if (!tk) throw notFound();
    if (tk.kind === "COMPLIMENTARY") throw invalid("NOT_PAID", "Complimentary tickets have no cash to reverse; revoke instead");
    if (tk.admissionStatus === "CHECKED_IN") throw conflict("ALREADY_USED", "Ticket already used for entry");
    if (tk.paymentStatus !== "CASH_REPORTED_COLLECTED") throw conflict("NOT_REVERSIBLE", tk.paymentStatus === "CASH_RECONCILED"
      ? "Cash for this ticket is already reconciled; process the refund from central cash and document it" : "Ticket has no collected payment");
    const sale = tk.cashTransactions.find((c) => c.type === "SALE");
    if (!sale) throw conflict("NO_SALE", "No sale record");
    await t.cashTransaction.create({
      data: {
        type: "REVERSAL", eventId: tk.eventId, ticketId: tk.id, sellerId: sale.sellerId, salesPointId: sale.salesPointId,
        customerId: sale.customerId, accountId: sale.accountId, amountMillimes: -sale.amountMillimes,
        reportedById: actor.id, authorizedById: actor.id, reversesId: sale.id, reason,
      },
    });
    await t.sellerCashAccount.update({ where: { id: sale.accountId }, data: { expectedMillimes: { decrement: sale.amountMillimes } } });
    await t.ticket.update({ where: { id: tk.id }, data: { inventoryStatus: "VOID", paymentStatus: "REVERSED", admissionStatus: "REVOKED" } });
    await t.$executeRaw`UPDATE events SET paid_sold_count = paid_sold_count - 1 WHERE id = ${tk.eventId}::uuid`;
    await t.$executeRaw`UPDATE ticket_categories SET sold_count = sold_count - 1 WHERE id = ${tk.categoryId}::uuid`;
    await t.ticketInventoryMovement.create({
      data: { ticketId: tk.id, actorId: actor.id, action: "REVERSED", fromInventory: "SOLD", toInventory: "VOID", fromPayment: tk.paymentStatus, toPayment: "REVERSED", fromAdmission: tk.admissionStatus, toAdmission: "REVOKED", note: reason },
    });
    await audit(t, actor.id, "SALE_REVERSED", "ticket", tk.id, { amountMillimes: sale.amountMillimes, sellerId: sale.sellerId, reason }, actor.ip);
  });
}

/** Revokes a complimentary ticket (frees its allocation slot). */
export async function revokeComplimentary(actor: Actor, ticketId: string, reason: string) {
  requireLeader(actor);
  return tx(async (t) => {
    const tk = await t.ticket.findUnique({ where: { id: ticketId } });
    if (!tk || tk.kind !== "COMPLIMENTARY") throw notFound();
    if (tk.admissionStatus !== "VALID") throw conflict("NOT_REVOCABLE", "Only unused valid tickets can be revoked");
    await t.ticket.update({ where: { id: tk.id }, data: { admissionStatus: "REVOKED", inventoryStatus: "VOID" } });
    await t.$executeRaw`UPDATE events SET comp_issued_count = comp_issued_count - 1 WHERE id = ${tk.eventId}::uuid`;
    await t.ticketInventoryMovement.create({ data: { ticketId: tk.id, actorId: actor.id, action: "VOIDED", fromInventory: "SOLD", toInventory: "VOID", fromAdmission: "VALID", toAdmission: "REVOKED", note: reason } });
    await audit(t, actor.id, "COMPLIMENTARY_REVOKED", "ticket", tk.id, { reason }, actor.ip);
  });
}

/**
 * Reissues a lost ticket: the holder's CIN must match (HMAC compare), the old QR token is
 * permanently invalidated and a new one generated.
 */
export async function reissueTicket(actor: Actor, ticketId: string, presentedCin: string, reason: string) {
  requireLeader(actor);
  const { cinDigest } = await import("@/lib/cin");
  const r = await tx(async (t) => {
    const tk = await t.ticket.findUnique({ where: { id: ticketId }, include: { holder: true } });
    if (!tk || !tk.holder) throw notFound();
    if (tk.admissionStatus !== "VALID") throw conflict("NOT_REISSUABLE", "Only valid, unused tickets can be reissued");
    if (tk.holder.cinHmac !== cinDigest(presentedCin)) throw forbidden("National ID does not match the ticket holder");
    // For physical tickets the printed QR becomes permanently invalid; the holder uses the emailed digital QR.
    const updated = await t.ticket.update({ where: { id: tk.id }, data: { qrToken: newQrToken(), manualCode: newManualCode() } });
    await t.ticketInventoryMovement.create({ data: { ticketId: tk.id, actorId: actor.id, action: "REISSUED", note: reason } });
    await audit(t, actor.id, "TICKET_REISSUED", "ticket", tk.id, { reason }, actor.ip);
    return updated;
  });
  const emails = await emailTickets([r.id]);
  return { ticketId: r.id, emails };
}


/**
 * Team Leader: email a ticket again (buyer + attendee). Only ever to the addresses already on the
 * ticket — never to an address typed in — so it cannot be used to send someone's ticket elsewhere.
 */
export async function resendTicketEmail(actor: Actor, ticketId: string) {
  requireLeader(actor);
  const tk = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!tk) throw notFound();
  if (!["VALID", "CHECKED_IN"].includes(tk.admissionStatus)) throw conflict("NOT_VALID", "Only valid tickets can be emailed");
  await prisma.auditLog.create({ data: { actorId: actor.id, action: "TICKET_EMAIL_RESENT", entityType: "ticket", entityId: tk.id, ip: actor.ip ?? null } });
  return { emails: await emailTickets([tk.id]) };
}
