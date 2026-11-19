import type { Tx } from "@/lib/db";
import { prisma } from "@/lib/db";
import { forbidden, invalid, notFound } from "@/lib/errors";
import type { Actor } from "./types";

export function requireLeader(actor: Actor) {
  if (actor.role !== "TEAM_LEADER") throw forbidden("Only the Team Leader can perform this action");
}

/** Sellers/scanners must be assigned to the event; Team Leaders are always authorized. */
export async function requireEventAccess(actor: Actor, eventId: string, t: Tx | typeof prisma = prisma) {
  if (actor.role === "TEAM_LEADER") return;
  const a = await t.eventSeller.findUnique({ where: { eventId_userId: { eventId, userId: actor.id } } });
  if (!a) throw forbidden("You are not assigned to this event");
}

export async function requireSalesPointMember(actor: Actor, salesPointId: string, t: Tx | typeof prisma = prisma) {
  const m = await t.salesPointMember.findUnique({ where: { userId_salesPointId: { userId: actor.id, salesPointId } } });
  if (!m) throw forbidden("You are not authorized for this sales point");
}

export async function loadSellableEvent(t: Tx, eventId: string) {
  const event = await t.event.findUnique({ where: { id: eventId } });
  if (!event) throw notFound("Event not found");
  if (event.status !== "PUBLISHED") throw invalid("EVENT_NOT_ON_SALE", "This event is not published for sale");
  if (event.endsAt < new Date()) throw invalid("EVENT_ENDED", "This event has ended");
  return event;
}
