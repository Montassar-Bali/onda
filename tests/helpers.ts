import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import type { Actor } from "@/services/types";
import { createEvent, setEventSellers, setEventStatus, upsertCategory, configureReservations } from "@/services/events";
import type { PersonInput } from "@/lib/validation";

let seq = 0;
const hash = bcrypt.hashSync("password-123", 4);

export async function mkUser(role: "TEAM_LEADER" | "TEAM_MEMBER", name = `${role}-${++seq}`): Promise<Actor> {
  const u = await prisma.user.create({ data: { email: `${name.toLowerCase()}-${Date.now()}-${seq}@t.test`, name, role, passwordHash: hash } });
  return { id: u.id, role: u.role, name: u.name };
}

let cinSeq = 10000000 + Math.floor(Math.random() * 80_000_000); // unique per test file
export function person(name?: string): PersonInput {
  const cin = String(++cinSeq);
  const tag = (cinSeq * 7919).toString(36);
  return { fullName: name ?? `Person ${tag}`, cin, phone: "+21620123456", email: `p-${tag}@t.test` };
}

export async function setupEvent(opts: { venue?: number; paid?: number; comp?: number; maxPerId?: number; price?: string } = {}) {
  const leader = await mkUser("TEAM_LEADER");
  const seller = await mkUser("TEAM_MEMBER");
  const event = await createEvent(leader, {
    name: "Summer Festival", venue: "Hammamet", startsAt: new Date(Date.now() + 7 * 86400e3), endsAt: new Date(Date.now() + 8 * 86400e3),
    venueCapacity: opts.venue ?? 500, paidTicketCapacity: opts.paid ?? 400, complimentaryAllocation: opts.comp ?? 20, maxTicketsPerIdentity: opts.maxPerId ?? 4,
  });
  const cat = await upsertCategory(leader, event.id, { name: "General", price: opts.price ?? "25.000" });
  await setEventSellers(leader, event.id, [seller.id]);
  await setEventStatus(leader, event.id, "PUBLISHED");
  return { leader, seller, event, cat };
}

export async function enableReservations(leader: Actor, eventId: string, quota: number, allowAdmission = false, perRes = 5) {
  await configureReservations(leader, eventId, {
    enabled: true, maxReservedAttendees: quota, maxTicketsPerReservation: perRes,
    opensAt: new Date(Date.now() - 3600e3), closesAt: new Date(Date.now() + 5 * 86400e3),
    expiryPolicy: "AT_EVENT_START", allowReservationAdmission: allowAdmission,
  });
}
