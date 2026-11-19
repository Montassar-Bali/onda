import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import type { Actor } from "@/services/types";

export async function teamEvents(actor: Actor) {
  return prisma.event.findMany({
    where: { status: "PUBLISHED", ...(actor.role === "TEAM_LEADER" ? {} : { sellers: { some: { userId: actor.id } } }) },
    orderBy: { startsAt: "asc" },
    include: { categories: { where: { active: true }, orderBy: { priceMillimes: "asc" } } },
  });
}

export async function teamEvent(actor: Actor, eventId: string) {
  const e = await prisma.event.findUnique({ where: { id: eventId }, include: { categories: { where: { active: true }, orderBy: { priceMillimes: "asc" } }, reservationInventory: true } });
  if (!e) notFound();
  if (actor.role !== "TEAM_LEADER") {
    const ok = await prisma.eventSeller.findUnique({ where: { eventId_userId: { eventId, userId: actor.id } } });
    if (!ok) redirect("/team");
  }
  const salesPoints = await prisma.salesPoint.findMany({ where: { active: true, members: { some: { userId: actor.id } } } });
  return { event: e, salesPoints };
}
