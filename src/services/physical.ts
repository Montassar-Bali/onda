import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { TicketInventoryStatus } from "@prisma/client";
import { advisoryLock, prisma, tx, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, invalid, notFound, forbidden } from "@/lib/errors";
import { newManualCode, newQrToken } from "@/lib/tokens";
import { uuid } from "@/lib/validation";
import { requireLeader } from "./guards";
import type { Actor } from "./types";

export const MAX_BATCH_SIZE = 200;

export const batchInput = z.object({
  eventId: uuid,
  categoryId: uuid,
  quantity: z.coerce.number().int().min(1).max(MAX_BATCH_SIZE, `A physical batch contains at most ${MAX_BATCH_SIZE} tickets`),
  sellerId: uuid.optional().nullable(),
  salesPointId: uuid.optional().nullable(),
});

/** Team Leader generates up to 200 pre-printed tickets: NOT_COLLECTED / NOT_ELIGIBLE until sold. */
export async function generateBatch(actor: Actor, raw: unknown) {
  requireLeader(actor);
  const d = batchInput.parse(raw);
  if (d.sellerId && d.salesPointId) throw invalid("ONE_ASSIGNEE", "Assign to a seller OR a sales point, not both");
  return tx(async (t) => {
    const event = await t.event.findUnique({ where: { id: d.eventId } });
    if (!event) throw notFound();
    if (event.status === "CLOSED" || event.status === "CANCELLED") throw invalid("EVENT_CLOSED", "Event is closed");
    const cat = await t.ticketCategory.findFirst({ where: { id: d.categoryId, eventId: d.eventId } });
    if (!cat) throw notFound("Category not found");
    if (d.sellerId) await assertSellerForEvent(t, d.sellerId, d.eventId);
    if (d.salesPointId) await assertSalesPoint(t, d.salesPointId);

    await advisoryLock(t, `batch-number:${event.id}`);
    const last = await t.physicalTicketBatch.aggregate({ where: { eventId: event.id }, _max: { number: true } });
    const number = (last._max.number ?? 0) + 1;
    const batch = await t.physicalTicketBatch.create({ data: { eventId: event.id, categoryId: cat.id, number, quantity: d.quantity, createdById: actor.id } });

    const assigned = !!(d.sellerId || d.salesPointId);
    const status: TicketInventoryStatus = assigned ? "ASSIGNED" : "AVAILABLE";
    const prefix = `${event.id.slice(0, 4).toUpperCase()}-B${String(number).padStart(3, "0")}`;
    const tickets = Array.from({ length: d.quantity }, (_, i) => ({
      id: randomUUID(), eventId: event.id, categoryId: cat.id, kind: "PHYSICAL" as const, batchId: batch.id,
      serial: `${prefix}-${String(i + 1).padStart(4, "0")}`, qrToken: newQrToken(), manualCode: newManualCode(),
      inventoryStatus: status, paymentStatus: "NOT_COLLECTED" as const, admissionStatus: "NOT_ELIGIBLE" as const,
      assignedSellerId: d.sellerId ?? null, assignedSalesPointId: d.salesPointId ?? null,
    }));
    await t.ticket.createMany({ data: tickets });
    await t.ticketInventoryMovement.createMany({
      data: tickets.map((tk) => ({ ticketId: tk.id, actorId: actor.id, action: "GENERATED", toInventory: "AVAILABLE" as const, toPayment: "NOT_COLLECTED" as const, toAdmission: "NOT_ELIGIBLE" as const })),
    });
    if (assigned) {
      await t.physicalTicketAssignment.createMany({ data: tickets.map((tk) => ({ ticketId: tk.id, sellerId: d.sellerId ?? null, salesPointId: d.salesPointId ?? null, assignedById: actor.id })) });
      await t.ticketInventoryMovement.createMany({ data: tickets.map((tk) => ({ ticketId: tk.id, actorId: actor.id, action: "ASSIGNED", fromInventory: "AVAILABLE" as const, toInventory: "ASSIGNED" as const })) });
    }
    await audit(t, actor.id, "PHYSICAL_BATCH_GENERATED", "physical_ticket_batch", batch.id, { number, quantity: d.quantity, categoryId: cat.id, sellerId: d.sellerId, salesPointId: d.salesPointId }, actor.ip);
    return batch;
  });
}

async function assertSellerForEvent(t: Tx, sellerId: string, eventId: string) {
  const u = await t.user.findUnique({ where: { id: sellerId } });
  if (!u || !u.active) throw invalid("SELLER_INACTIVE", "Seller not found or inactive");
  const a = await t.eventSeller.findUnique({ where: { eventId_userId: { eventId, userId: sellerId } } });
  if (!a) throw invalid("SELLER_NOT_ASSIGNED", "Seller is not assigned to this event");
}
async function assertSalesPoint(t: Tx, id: string) {
  const sp = await t.salesPoint.findUnique({ where: { id } });
  if (!sp || !sp.active) throw invalid("SALES_POINT_INACTIVE", "Sales point not found or inactive");
}

export const assignInput = z.object({
  ticketIds: z.array(uuid).min(1).max(1000),
  sellerId: uuid.optional().nullable(),
  salesPointId: uuid.optional().nullable(),
});

/** AVAILABLE → ASSIGNED. */
export async function assignTickets(actor: Actor, raw: unknown) {
  requireLeader(actor);
  const d = assignInput.parse(raw);
  if (!!d.sellerId === !!d.salesPointId) throw invalid("ONE_ASSIGNEE", "Assign to exactly one seller or one sales point");
  return tx(async (t) => {
    const tickets = await lockTickets(t, d.ticketIds);
    for (const tk of tickets) {
      if (tk.kind !== "PHYSICAL") throw invalid("NOT_PHYSICAL", `${tk.serial} is not a physical ticket`);
      if (tk.inventoryStatus !== "AVAILABLE") throw conflict("NOT_AVAILABLE", `${tk.serial} is ${tk.inventoryStatus}; use a transfer for assigned tickets`);
      if (d.sellerId) await assertSellerForEvent(t, d.sellerId, tk.eventId);
    }
    if (d.salesPointId) await assertSalesPoint(t, d.salesPointId);
    await t.ticket.updateMany({ where: { id: { in: d.ticketIds }, inventoryStatus: "AVAILABLE" }, data: { inventoryStatus: "ASSIGNED", assignedSellerId: d.sellerId ?? null, assignedSalesPointId: d.salesPointId ?? null } });
    await t.physicalTicketAssignment.createMany({ data: d.ticketIds.map((ticketId) => ({ ticketId, sellerId: d.sellerId ?? null, salesPointId: d.salesPointId ?? null, assignedById: actor.id })) });
    await t.ticketInventoryMovement.createMany({ data: d.ticketIds.map((ticketId) => ({ ticketId, actorId: actor.id, action: "ASSIGNED", fromInventory: "AVAILABLE" as const, toInventory: "ASSIGNED" as const })) });
    await audit(t, actor.id, "PHYSICAL_ASSIGNED", "ticket", null, { count: d.ticketIds.length, sellerId: d.sellerId, salesPointId: d.salesPointId }, actor.ip);
    return { count: d.ticketIds.length };
  });
}

export const transferInput = assignInput.extend({ reason: z.string().trim().min(3).max(500) });

/** Authorized transfer of ASSIGNED tickets to another seller / sales point. */
export async function transferTickets(actor: Actor, raw: unknown) {
  requireLeader(actor);
  const d = transferInput.parse(raw);
  if (!!d.sellerId === !!d.salesPointId) throw invalid("ONE_ASSIGNEE", "Transfer to exactly one seller or one sales point");
  return tx(async (t) => {
    const tickets = await lockTickets(t, d.ticketIds);
    for (const tk of tickets) {
      if (tk.inventoryStatus !== "ASSIGNED") throw conflict("NOT_ASSIGNED", `${tk.serial} is ${tk.inventoryStatus}; only assigned unsold tickets can be transferred`);
      if (d.sellerId) await assertSellerForEvent(t, d.sellerId, tk.eventId);
    }
    if (d.salesPointId) await assertSalesPoint(t, d.salesPointId);
    for (const tk of tickets) {
      await t.ticketTransfer.create({
        data: { ticketId: tk.id, fromSellerId: tk.assignedSellerId, fromSalesPointId: tk.assignedSalesPointId, toSellerId: d.sellerId ?? null, toSalesPointId: d.salesPointId ?? null, authorizedById: actor.id, reason: d.reason },
      });
      await t.physicalTicketAssignment.create({ data: { ticketId: tk.id, sellerId: d.sellerId ?? null, salesPointId: d.salesPointId ?? null, assignedById: actor.id } });
      await t.ticketInventoryMovement.create({ data: { ticketId: tk.id, actorId: actor.id, action: "TRANSFERRED", fromInventory: "ASSIGNED", toInventory: "ASSIGNED", note: d.reason } });
    }
    await t.ticket.updateMany({ where: { id: { in: d.ticketIds }, inventoryStatus: "ASSIGNED" }, data: { assignedSellerId: d.sellerId ?? null, assignedSalesPointId: d.salesPointId ?? null } });
    await audit(t, actor.id, "PHYSICAL_TRANSFERRED", "ticket", null, { count: tickets.length, toSellerId: d.sellerId, toSalesPointId: d.salesPointId, reason: d.reason }, actor.ip);
    return { count: tickets.length };
  });
}

/** Seller (own tickets) or Team Leader: unsold ASSIGNED → RETURNED, awaiting administrator review. */
export async function returnTickets(actor: Actor, ticketIds: string[], note?: string) {
  return tx(async (t) => {
    const tickets = await lockTickets(t, ticketIds);
    for (const tk of tickets) {
      if (tk.inventoryStatus !== "ASSIGNED") throw conflict("NOT_ASSIGNED", `${tk.serial} is ${tk.inventoryStatus}`);
      if (actor.role !== "TEAM_LEADER") {
        const own = tk.assignedSellerId === actor.id || (tk.assignedSalesPointId && (await t.salesPointMember.findUnique({ where: { userId_salesPointId: { userId: actor.id, salesPointId: tk.assignedSalesPointId } } })));
        if (!own) throw forbidden(`${tk.serial} is not assigned to you`);
      }
    }
    await t.ticket.updateMany({ where: { id: { in: ticketIds }, inventoryStatus: "ASSIGNED" }, data: { inventoryStatus: "RETURNED", assignedSellerId: null, assignedSalesPointId: null } });
    await t.ticketInventoryMovement.createMany({ data: ticketIds.map((ticketId) => ({ ticketId, actorId: actor.id, action: "RETURNED", fromInventory: "ASSIGNED" as const, toInventory: "RETURNED" as const, note: note ?? null })) });
    await audit(t, actor.id, "PHYSICAL_RETURNED", "ticket", null, { count: ticketIds.length, note }, actor.ip);
    return { count: ticketIds.length };
  });
}

/** Team Leader review of RETURNED tickets: restock (→ AVAILABLE) or void. */
export async function reviewReturned(actor: Actor, ticketIds: string[], decision: "RESTOCK" | "VOID", reason: string) {
  requireLeader(actor);
  return tx(async (t) => {
    const tickets = await lockTickets(t, ticketIds);
    for (const tk of tickets) if (tk.inventoryStatus !== "RETURNED") throw conflict("NOT_RETURNED", `${tk.serial} is ${tk.inventoryStatus}`);
    const to: TicketInventoryStatus = decision === "RESTOCK" ? "AVAILABLE" : "VOID";
    await t.ticket.updateMany({ where: { id: { in: ticketIds }, inventoryStatus: "RETURNED" }, data: { inventoryStatus: to } });
    await t.ticketInventoryMovement.createMany({ data: ticketIds.map((ticketId) => ({ ticketId, actorId: actor.id, action: decision === "RESTOCK" ? "RESTOCKED" : "VOIDED", fromInventory: "RETURNED" as const, toInventory: to, note: reason })) });
    await audit(t, actor.id, `PHYSICAL_${decision}`, "ticket", null, { count: ticketIds.length, reason }, actor.ip);
    return { count: ticketIds.length };
  });
}

/** Team Leader permanently invalidates unsold physical tickets (lost / damaged / stolen). */
export async function voidUnsold(actor: Actor, ticketIds: string[], reason: string) {
  requireLeader(actor);
  if (reason.trim().length < 3) throw invalid("REASON_REQUIRED", "Reason required");
  return tx(async (t) => {
    const tickets = await lockTickets(t, ticketIds);
    for (const tk of tickets) {
      if (!["AVAILABLE", "ASSIGNED", "RETURNED"].includes(tk.inventoryStatus)) throw conflict("NOT_UNSOLD", `${tk.serial} is ${tk.inventoryStatus}; sold tickets must be reversed`);
    }
    for (const tk of tickets) {
      await t.ticket.update({ where: { id: tk.id }, data: { inventoryStatus: "VOID", assignedSellerId: null, assignedSalesPointId: null } });
      await t.ticketInventoryMovement.create({ data: { ticketId: tk.id, actorId: actor.id, action: "VOIDED", fromInventory: tk.inventoryStatus, toInventory: "VOID", note: reason } });
    }
    await audit(t, actor.id, "PHYSICAL_VOIDED", "ticket", null, { count: tickets.length, reason }, actor.ip);
    return { count: tickets.length };
  });
}

export async function markBatchPrinted(actor: Actor, batchId: string) {
  requireLeader(actor);
  return tx(async (t) => {
    const b = await t.physicalTicketBatch.update({ where: { id: batchId }, data: { printedAt: new Date(), printedById: actor.id, printCount: { increment: 1 } } });
    await audit(t, actor.id, "PHYSICAL_BATCH_PRINTED", "physical_ticket_batch", batchId, { printCount: b.printCount }, actor.ip);
    return b;
  });
}

async function lockTickets(t: Tx, ids: string[]) {
  const unique = [...new Set(ids)].sort();
  if (unique.length !== ids.length) throw invalid("DUPLICATE_IDS", "Duplicate ticket ids");
  await t.$queryRaw`SELECT id FROM tickets WHERE id = ANY(${unique}::uuid[]) ORDER BY id FOR UPDATE`;
  const tickets = await t.ticket.findMany({ where: { id: { in: unique } } });
  if (tickets.length !== unique.length) throw notFound("Some tickets were not found");
  return tickets;
}

export function batchTickets(batchId: string) {
  return prisma.ticket.findMany({ where: { batchId }, orderBy: { serial: "asc" }, include: { assignedSeller: { select: { name: true } }, assignedSalesPoint: { select: { name: true } } } });
}
