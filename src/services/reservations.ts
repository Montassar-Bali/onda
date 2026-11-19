import { z } from "zod";
import { advisoryLock, prisma, tx, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { cinDigest } from "@/lib/cin";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { newManualCode, newQrToken, newReservationCode } from "@/lib/tokens";
import { cinSchema, personSchema, uuid } from "@/lib/validation";
import { randomBytes } from "node:crypto";
import { assertDistinctCins, upsertIdentity } from "./identity";
import { emailReservation, emailTickets } from "./notifications";
import { capacityLockKey, consumePaidInventory, assertIdentityLimit, getOrCreateAccount } from "./sales";
import { loadSellableEvent, requireEventAccess, requireSalesPointMember } from "./guards";
import type { Actor } from "./types";

/**
 * Unpaid reservations (spec §1.4, §7). They live in their own tables and their own counter
 * (reservation_inventory.pending_attendees). They NEVER touch paid_sold_count, revenue or
 * ticket admission statuses.
 */

export const reservationInput = z.object({
  eventId: uuid,
  categoryId: uuid,
  purchaser: personSchema,
  attendees: z.array(personSchema).min(1).max(20),
  acknowledgeNotATicket: z.literal(true, { error: "You must acknowledge that a reservation is not a paid ticket" }),
});

function computeExpiry(inv: { expiryPolicy: string; expiryHours: number | null; closesAt: Date }, eventStart: Date, now = new Date()) {
  let e: Date;
  if (inv.expiryPolicy === "HOURS_AFTER_CREATION") e = new Date(now.getTime() + (inv.expiryHours ?? 24) * 3600_000);
  else if (inv.expiryPolicy === "AT_RESERVATION_CLOSE") e = inv.closesAt;
  else e = eventStart;
  return e > eventStart ? eventStart : e;
}

export async function createReservation(raw: unknown, ip?: string | null) {
  const d = reservationInput.parse(raw);
  assertDistinctCins(d.attendees);
  const r = await tx(async (t) => {
    const event = await loadSellableEvent(t, d.eventId);
    const inv = await t.reservationInventory.findUnique({ where: { eventId: event.id } });
    const now = new Date();
    if (!inv || !inv.enabled) throw invalid("RESERVATIONS_DISABLED", "Reservations are not open for this event");
    if (now < inv.opensAt) throw invalid("RESERVATIONS_NOT_OPEN", `Reservations open on ${inv.opensAt.toISOString()}`);
    if (now > inv.closesAt) throw invalid("RESERVATIONS_CLOSED", "Reservations are closed for this event");
    if (d.attendees.length > inv.maxTicketsPerReservation) throw invalid("TOO_MANY_ATTENDEES", `At most ${inv.maxTicketsPerReservation} attendees per reservation`);
    const cat = await t.ticketCategory.findFirst({ where: { id: d.categoryId, eventId: event.id, active: true } });
    if (!cat) throw notFound("Category not found");

    // Anti-abuse: at most 2 pending reservations per purchaser email per edition (stops email bombing
    // a victim's inbox and filling the quota from one address).
    const sameEmail = await t.reservation.count({ where: { eventId: event.id, status: "PENDING", purchaser: { email: d.purchaser.email } } });
    if (sameEmail >= 2) throw conflict("EMAIL_LIMIT", "This email already has pending reservations for this edition");

    // Public flow: never overwrite the contact details of an existing identity.
    const purchaser = await upsertIdentity(t, d.purchaser, event.endsAt, { trustedContact: false });
    const attendeeIds: string[] = [];
    for (const a of d.attendees) attendeeIds.push((await upsertIdentity(t, a, event.endsAt, { trustedContact: false })).identity.id);
    for (const id of [...attendeeIds].sort()) {
      await advisoryLock(t, `reservation-identity:${event.id}:${id}`);
      const existing = await t.reservationAttendee.count({ where: { eventId: event.id, identityId: id, reservation: { status: "PENDING" } } });
      if (existing > 0) throw conflict("ALREADY_RESERVED", "One of the attendees cannot be added to a reservation for this edition");
    }
    // Separate quota — the ONLY counter a reservation touches.
    const n = await t.$executeRaw`
      UPDATE reservation_inventory SET pending_attendees = pending_attendees + ${attendeeIds.length}
      WHERE event_id = ${event.id}::uuid AND enabled AND pending_attendees + ${attendeeIds.length} <= max_reserved_attendees`;
    if (n !== 1) throw conflict("RESERVATION_QUOTA_FULL", "The reservation quota for this event is full");

    const res = await t.reservation.create({
      data: {
        eventId: event.id, categoryId: cat.id, code: newReservationCode(), purchaserId: purchaser.identity.id,
        expiresAt: computeExpiry(inv, event.startsAt, now),
        attendees: { create: attendeeIds.map((identityId) => ({ identityId, eventId: event.id })) },
      },
    });
    await audit(t, null, "RESERVATION_CREATED", "reservation", res.id, { eventId: event.id, attendees: attendeeIds.length }, ip);
    return res;
  });
  await emailReservation(r.id);
  return { code: r.code, expiresAt: r.expiresAt };
}

/** Releases quota for a PENDING reservation; used by cancel / expire / convert. */
async function closeReservation(t: Tx, reservationId: string, status: "EXPIRED" | "CANCELLED" | "CONVERTED", actorId: string | null, reason: string) {
  const r = await t.reservation.findUnique({ where: { id: reservationId }, include: { _count: { select: { attendees: true } } } });
  if (!r) throw notFound();
  const u = await t.reservation.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status, closedAt: new Date(), closeReason: reason, handledById: actorId } });
  if (u.count !== 1) throw conflict("NOT_PENDING", "Reservation is no longer pending");
  await t.$executeRaw`UPDATE reservation_inventory SET pending_attendees = pending_attendees - ${r._count.attendees} WHERE event_id = ${r.eventId}::uuid`;
  await audit(t, actorId, `RESERVATION_${status}`, "reservation", r.id, { reason });
}

export async function expireDueReservations(now = new Date()) {
  const due = await prisma.reservation.findMany({ where: { status: "PENDING", expiresAt: { lt: now } }, select: { id: true } });
  let n = 0;
  for (const r of due) {
    try { await tx((t) => closeReservation(t, r.id, "EXPIRED", null, "Expiration policy")); n++; } catch { /* concurrently closed */ }
  }
  return n;
}

async function loadPending(code: string) {
  const r = await prisma.reservation.findUnique({ where: { code }, include: { attendees: true } });
  if (!r) throw notFound("Reservation not found");
  if (r.status === "PENDING" && r.expiresAt < new Date()) {
    await tx((t) => closeReservation(t, r.id, "EXPIRED", null, "Expiration policy")).catch(() => undefined);
    throw conflict("RESERVATION_EXPIRED", "This reservation has expired");
  }
  if (r.status !== "PENDING") throw conflict("NOT_PENDING", `Reservation is ${r.status}`);
  return r;
}

/** Customer self-cancel: requires the purchaser's CIN (verified via HMAC). */
export async function cancelReservationByCustomer(code: string, purchaserCin: string, ip?: string | null) {
  const cin = cinSchema.parse(purchaserCin);
  const r = await loadPending(code);
  const p = await prisma.customerIdentityRecord.findUnique({ where: { id: r.purchaserId } });
  if (p?.cinHmac !== cinDigest(cin)) throw forbidden("National ID does not match the reservation");
  await tx((t) => closeReservation(t, r.id, "CANCELLED", null, "Cancelled by customer"));
  void ip;
}

export async function cancelReservationByTeam(actor: Actor, code: string, reason: string) {
  const r = await loadPending(code);
  await requireEventAccess(actor, r.eventId);
  await tx((t) => closeReservation(t, r.id, "CANCELLED", actor.id, reason || "Cancelled by team"));
}

/** Team lookup — returns masked data only. */
export async function lookupReservation(actor: Actor, code: string) {
  const r = await prisma.reservation.findUnique({
    where: { code },
    include: {
      event: { include: { reservationInventory: true } }, category: true,
      purchaser: { select: { fullName: true, cinLast3: true } },
      attendees: { include: { identity: { select: { fullName: true, cinLast3: true } }, ticket: { select: { serial: true } } } },
    },
  });
  if (!r) throw notFound("Reservation not found");
  await requireEventAccess(actor, r.eventId);
  return r;
}

export const convertInput = z.object({
  code: z.string().min(5),
  /** Seller re-enters the purchaser's CIN from the physical card to confirm identity. */
  purchaserCin: cinSchema,
  salesPointId: uuid.optional().nullable(),
  cashCollected: z.literal(true, { error: "You must confirm that the cash was collected" }),
  expectedUnitPriceMillimes: z.number().int().positive(),
});

/**
 * Converts an unpaid reservation into paid tickets — an explicit, seller-performed cash sale
 * (never automatic). Consumes PAID inventory at that moment; fails if paid stock is gone.
 */
export async function convertReservation(actor: Actor, raw: unknown) {
  const d = convertInput.parse(raw);
  const r = await loadPending(d.code);
  await requireEventAccess(actor, r.eventId);
  if (d.salesPointId) await requireSalesPointMember(actor, d.salesPointId);
  const result = await tx(async (t) => {
    const purchaser = await t.customerIdentityRecord.findUnique({ where: { id: r.purchaserId } });
    if (purchaser?.cinHmac !== cinDigest(d.purchaserCin)) throw forbidden("National ID does not match the reservation purchaser");
    const event = await loadSellableEvent(t, r.eventId);
    const cat = await t.ticketCategory.findUniqueOrThrow({ where: { id: r.categoryId } });
    if (cat.priceMillimes !== d.expectedUnitPriceMillimes) throw conflict("PRICE_CHANGED", "The official price changed. Confirm the new price before collecting cash.");
    await advisoryLock(t, capacityLockKey(event.id));
    const attendees = r.attendees.filter((a) => !a.admittedAt);
    if (attendees.length === 0) throw conflict("NOTHING_TO_CONVERT", "All attendees were already admitted");
    for (const a of [...attendees].sort((x, y) => x.identityId.localeCompare(y.identityId))) await assertIdentityLimit(t, event, a.identityId, 1);
    await consumePaidInventory(t, event.id, cat.id, attendees.length);
    const account = await getOrCreateAccount(t, actor.id, event.id);
    const ticketIds: string[] = [];
    for (const a of attendees) {
      const tk = await t.ticket.create({
        data: {
          eventId: event.id, categoryId: cat.id, kind: "DIGITAL",
          serial: `${event.id.slice(0, 4).toUpperCase()}-D-${randomBytes(4).toString("hex").toUpperCase()}`, qrToken: newQrToken(), manualCode: newManualCode(),
          inventoryStatus: "SOLD", paymentStatus: "CASH_REPORTED_COLLECTED", admissionStatus: "VALID", priceMillimes: cat.priceMillimes,
          holderIdentityId: a.identityId, purchaserIdentityId: r.purchaserId, soldById: actor.id, soldAt: new Date(),
          salesPointId: d.salesPointId ?? null, reservationAttendeeId: a.id,
        },
      });
      await t.cashTransaction.create({
        data: { type: "SALE", eventId: event.id, ticketId: tk.id, sellerId: actor.id, salesPointId: d.salesPointId ?? null, customerId: a.identityId, accountId: account.id, amountMillimes: cat.priceMillimes, reportedById: actor.id },
      });
      await t.ticketInventoryMovement.create({ data: { ticketId: tk.id, actorId: actor.id, action: "SOLD", toInventory: "SOLD", toPayment: "CASH_REPORTED_COLLECTED", toAdmission: "VALID", note: `Converted from reservation ${r.code}` } });
      ticketIds.push(tk.id);
    }
    await t.sellerCashAccount.update({ where: { id: account.id }, data: { expectedMillimes: { increment: cat.priceMillimes * ticketIds.length } } });
    await closeReservation(t, r.id, "CONVERTED", actor.id, "Paid in cash");
    await audit(t, actor.id, "RESERVATION_CONVERTED_SALE", "reservation", r.id, { ticketIds, unitPriceMillimes: cat.priceMillimes }, actor.ip);
    return { ticketIds, totalMillimes: cat.priceMillimes * ticketIds.length };
  });
  const emails = await emailTickets(result.ticketIds);
  return { ...result, emails };
}

export async function publicReservationStatus(code: string) {
  const r = await prisma.reservation.findUnique({
    where: { code },
    include: { event: { select: { name: true, theme: true, venue: true, startsAt: true } }, category: { select: { name: true, priceMillimes: true } }, _count: { select: { attendees: true } } },
  });
  if (!r) return null;
  const expired = r.status === "PENDING" && r.expiresAt < new Date();
  return { ...r, status: expired ? "EXPIRED" : r.status };
}
