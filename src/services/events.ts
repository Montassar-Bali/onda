import { z } from "zod";
import { prisma, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { tndSchema } from "@/lib/validation";
import { requireLeader } from "./guards";
import type { Actor } from "./types";

export const eventInput = z
  .object({
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(4000).optional().nullable(),
    theme: z.string().trim().max(80).optional().nullable(),
    themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Theme colour must look like #e1102a").optional().nullable(),
    venue: z.string().trim().min(2).max(200),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    venueCapacity: z.coerce.number().int().positive(),
    paidTicketCapacity: z.coerce.number().int().min(0),
    complimentaryAllocation: z.coerce.number().int().min(0),
    maxTicketsPerIdentity: z.coerce.number().int().min(1).max(50),
  })
  .refine((e) => e.endsAt > e.startsAt, { message: "End must be after start", path: ["endsAt"] })
  .refine((e) => e.paidTicketCapacity + e.complimentaryAllocation <= e.venueCapacity, {
    message: "Paid capacity + complimentary allocation cannot exceed venue capacity",
    path: ["paidTicketCapacity"],
  });

export async function createEvent(actor: Actor, raw: unknown) {
  requireLeader(actor);
  const d = eventInput.parse(raw);
  return tx(async (t) => {
    const e = await t.event.create({ data: { ...d, createdById: actor.id } });
    await t.reservationInventory.create({
      data: {
        eventId: e.id, enabled: false, maxReservedAttendees: 0, maxTicketsPerReservation: 1,
        opensAt: new Date(), closesAt: d.startsAt > new Date() ? d.startsAt : new Date(Date.now() + 60_000),
        expiryPolicy: "AT_EVENT_START",
      },
    });
    await audit(t, actor.id, "EVENT_CREATED", "event", e.id, { name: e.name, venueCapacity: e.venueCapacity }, actor.ip);
    return e;
  });
}

export async function updateEvent(actor: Actor, eventId: string, raw: unknown) {
  requireLeader(actor);
  const d = eventInput.parse(raw);
  return tx(async (t) => {
    const e = await t.event.findUnique({ where: { id: eventId } });
    if (!e) throw notFound();
    if (d.paidTicketCapacity < e.paidSoldCount) throw conflict("CAPACITY_BELOW_SOLD", `Paid capacity cannot go below ${e.paidSoldCount} tickets already sold`);
    if (d.complimentaryAllocation < e.compIssuedCount) throw conflict("CAPACITY_BELOW_ISSUED", `Complimentary allocation cannot go below ${e.compIssuedCount} already issued`);
    if (d.venueCapacity < e.checkedInCount) throw conflict("CAPACITY_BELOW_ATTENDANCE", "Venue capacity cannot go below current attendance");
    const u = await t.event.update({ where: { id: eventId }, data: d });
    await audit(t, actor.id, "EVENT_UPDATED", "event", eventId, { before: pickCaps(e), after: pickCaps(u) }, actor.ip);
    return u;
  });
}
const pickCaps = (e: { venueCapacity: number; paidTicketCapacity: number; complimentaryAllocation: number; maxTicketsPerIdentity: number }) => ({
  venueCapacity: e.venueCapacity, paidTicketCapacity: e.paidTicketCapacity, complimentaryAllocation: e.complimentaryAllocation, maxTicketsPerIdentity: e.maxTicketsPerIdentity,
});

export async function setEventStatus(actor: Actor, eventId: string, status: "PUBLISHED" | "CLOSED" | "CANCELLED") {
  requireLeader(actor);
  return tx(async (t) => {
    const e = await t.event.findUnique({ where: { id: eventId }, include: { categories: { where: { active: true } } } });
    if (!e) throw notFound();
    if (status === "PUBLISHED" && e.categories.length === 0) throw invalid("NO_CATEGORIES", "Add at least one ticket category before publishing");
    const u = await t.event.update({ where: { id: eventId }, data: { status, publishedAt: status === "PUBLISHED" ? e.publishedAt ?? new Date() : e.publishedAt } });
    await audit(t, actor.id, `EVENT_${status}`, "event", eventId, {}, actor.ip);
    return u;
  });
}

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(80),
  price: tndSchema.refine((v) => v > 0, "Price must be greater than 0 TND"),
  capacity: z.coerce.number().int().positive().optional().nullable(),
});

export async function upsertCategory(actor: Actor, eventId: string, raw: unknown, categoryId?: string) {
  requireLeader(actor);
  const d = categoryInput.parse(raw);
  return tx(async (t) => {
    if (categoryId) {
      const c = await t.ticketCategory.findFirst({ where: { id: categoryId, eventId } });
      if (!c) throw notFound();
      if (c.soldCount > 0 && c.priceMillimes !== d.price) throw conflict("PRICE_LOCKED", "Price cannot change after tickets have been sold in this category");
      if (d.capacity != null && d.capacity < c.soldCount) throw conflict("CAPACITY_BELOW_SOLD", "Category capacity below sold count");
      const u = await t.ticketCategory.update({ where: { id: c.id }, data: { name: d.name, priceMillimes: d.price, capacity: d.capacity ?? null } });
      await audit(t, actor.id, "CATEGORY_UPDATED", "ticket_category", c.id, { priceMillimes: d.price, before: c.priceMillimes }, actor.ip);
      return u;
    }
    const c = await t.ticketCategory.create({ data: { eventId, name: d.name, priceMillimes: d.price, capacity: d.capacity ?? null } });
    await audit(t, actor.id, "CATEGORY_CREATED", "ticket_category", c.id, { priceMillimes: d.price }, actor.ip);
    return c;
  });
}

export async function setEventSellers(actor: Actor, eventId: string, userIds: string[]) {
  requireLeader(actor);
  return tx(async (t) => {
    await t.eventSeller.deleteMany({ where: { eventId, userId: { notIn: userIds } } });
    for (const userId of userIds) {
      await t.eventSeller.upsert({ where: { eventId_userId: { eventId, userId } }, create: { eventId, userId }, update: {} });
    }
    await audit(t, actor.id, "EVENT_SELLERS_SET", "event", eventId, { userIds }, actor.ip);
  });
}

export const reservationConfigInput = z
  .object({
    enabled: z.coerce.boolean(),
    maxReservedAttendees: z.coerce.number().int().min(0),
    maxTicketsPerReservation: z.coerce.number().int().min(1).max(20),
    opensAt: z.coerce.date(),
    closesAt: z.coerce.date(),
    expiryPolicy: z.enum(["HOURS_AFTER_CREATION", "AT_RESERVATION_CLOSE", "AT_EVENT_START"]),
    expiryHours: z.coerce.number().int().min(1).optional().nullable(),
    allowReservationAdmission: z.coerce.boolean(),
  })
  .refine((r) => r.closesAt > r.opensAt, { message: "Closing must be after opening", path: ["closesAt"] })
  .refine((r) => r.expiryPolicy !== "HOURS_AFTER_CREATION" || (r.expiryHours ?? 0) >= 1, { message: "Expiry hours required", path: ["expiryHours"] });

export async function configureReservations(actor: Actor, eventId: string, raw: unknown) {
  requireLeader(actor);
  const d = reservationConfigInput.parse(raw);
  return tx(async (t) => {
    const inv = await t.reservationInventory.findUnique({ where: { eventId } });
    if (!inv) throw notFound();
    if (d.maxReservedAttendees < inv.pendingAttendees) throw conflict("QUOTA_BELOW_PENDING", `Quota cannot go below ${inv.pendingAttendees} pending reserved attendees`);
    const u = await t.reservationInventory.update({ where: { eventId }, data: { ...d, expiryHours: d.expiryHours ?? null } });
    await audit(t, actor.id, "RESERVATION_CONFIG_UPDATED", "event", eventId, d as unknown as Record<string, unknown>, actor.ip);
    return u;
  });
}

export function listPublishedEvents() {
  return prisma.event.findMany({
    where: { status: "PUBLISHED", endsAt: { gt: new Date() } },
    orderBy: { startsAt: "asc" },
    include: { categories: { where: { active: true }, orderBy: { priceMillimes: "asc" } }, reservationInventory: true },
  });
}
