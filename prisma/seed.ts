/**
 * Development seed — refuses to run in production.
 * Creates demo staff accounts:
 *   leader@tropical.test, leader2@tropical.test (Team Leaders), seller1@tropical.test, seller2@tropical.test (Team Members)
 * Passwords come from SEED_LEADER_PASSWORD / SEED_SELLER_PASSWORD in your local .env (never committed);
 * when unset, random passwords are generated and printed once in your terminal.
 */
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/db";
import { createEvent, upsertCategory, setEventSellers, setEventStatus, configureReservations } from "../src/services/events";
import { createSalesPoint, setSalesPointMembers } from "../src/services/users";
import { generateBatch } from "../src/services/physical";

async function user(email: string, name: string, role: "TEAM_LEADER" | "TEAM_MEMBER", password: string) {
  return prisma.user.upsert({ where: { email }, update: {}, create: { email, name, role, passwordHash: await bcrypt.hash(password, 12) } });
}

const pw = (envName: string) => {
  const v = process.env[envName];
  if (v && v.length >= 12) return v;
  const generated = randomBytes(12).toString("base64url");
  console.log(`${envName} not set — generated a password for new demo accounts: ${generated}`);
  return generated;
};

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");
  const leaderPw = pw("SEED_LEADER_PASSWORD"), sellerPw = pw("SEED_SELLER_PASSWORD");
  const leader = await user("leader@tropical.test", "Sami (Team Leader)", "TEAM_LEADER", leaderPw);
  await user("leader2@tropical.test", "Ines (Team Leader)", "TEAM_LEADER", leaderPw);
  const s1 = await user("seller1@tropical.test", "Youssef (Seller)", "TEAM_MEMBER", sellerPw);
  const s2 = await user("seller2@tropical.test", "Mariem (Seller)", "TEAM_MEMBER", sellerPw);
  const actor = { id: leader.id, role: leader.role, name: leader.name };

  if (await prisma.event.count()) { console.log("Seed: events already exist, skipping event creation."); return; }

  const booth = await createSalesPoint(actor, { name: "Main Gate Booth", location: "Tropical Bar entrance" });
  await setSalesPointMembers(actor, booth.id, [s1.id]);

  // ONDA, 3 December 2026 at Tropical Bar — Brazilian theme (20:00–02:00 Tunis time).
  const start = new Date("2026-12-03T19:00:00Z");
  const ev = await createEvent(actor, {
    name: "ONDA", theme: "Brazilian Night", themeColor: "#009c3b", description: "ONDA at Tropical Bar. This edition's theme: Brazil.", venue: "Tropical Bar",
    startsAt: start, endsAt: new Date(start.getTime() + 6 * 3600e3),
    venueCapacity: 500, paidTicketCapacity: 400, complimentaryAllocation: 20, maxTicketsPerIdentity: 4,
  });
  const general = await upsertCategory(actor, ev.id, { name: "General", price: "25.000" });
  await upsertCategory(actor, ev.id, { name: "VIP", price: "60.500", capacity: 50 });
  await setEventSellers(actor, ev.id, [s1.id, s2.id]);
  await configureReservations(actor, ev.id, {
    enabled: true, maxReservedAttendees: 200, maxTicketsPerReservation: 5,
    opensAt: new Date(Math.min(Date.now(), start.getTime()) - 86400e3), closesAt: new Date(start.getTime() - 86400e3),
    expiryPolicy: "HOURS_AFTER_CREATION", expiryHours: 72, allowReservationAdmission: false,
  });
  await setEventStatus(actor, ev.id, "PUBLISHED");
  await generateBatch(actor, { eventId: ev.id, categoryId: general.id, quantity: 20, salesPointId: booth.id });
  await generateBatch(actor, { eventId: ev.id, categoryId: general.id, quantity: 10, sellerId: s2.id });
  console.log("Seed complete:", ev.name);
}

main().finally(() => prisma.$disconnect());
