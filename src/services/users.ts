import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { revokeAllSessions } from "./sessions";
import { z } from "zod";
import { prisma, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict } from "@/lib/errors";
import { requireLeader } from "./guards";
import type { Actor } from "./types";

export const userInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(12, "Password must be at least 12 characters").max(200),
  role: z.enum(["TEAM_LEADER", "TEAM_MEMBER"]),
});

export async function createUser(actor: Actor, raw: unknown) {
  requireLeader(actor);
  const d = userInput.parse(raw);
  return tx(async (t) => {
    if (await t.user.findUnique({ where: { email: d.email } })) throw conflict("EMAIL_TAKEN", "Email already registered");
    const u = await t.user.create({ data: { email: d.email, name: d.name, role: d.role, passwordHash: await bcrypt.hash(d.password, 12) } });
    await audit(t, actor.id, "USER_CREATED", "user", u.id, { email: u.email, role: u.role }, actor.ip);
    return { id: u.id, email: u.email, name: u.name, role: u.role };
  });
}

export async function setUserActive(actor: Actor, userId: string, active: boolean) {
  requireLeader(actor);
  if (userId === actor.id && !active) throw conflict("SELF_DEACTIVATE", "You cannot deactivate yourself");
  await tx(async (t) => {
    await t.user.update({ where: { id: userId }, data: { active } });
    await audit(t, actor.id, active ? "USER_ACTIVATED" : "USER_DEACTIVATED", "user", userId, {}, actor.ip);
  });
  if (!active) await revokeAllSessions(userId); // signed-in devices lose access immediately
}

/** A real bcrypt hash of random data, so unknown emails cost the same time as wrong passwords (no account enumeration by timing). */
let dummyHash: string | null = null;
const dummy = () => (dummyHash ??= bcrypt.hashSync(randomBytes(18).toString("hex"), 12));

export async function verifyCredentials(email: string, password: string) {
  const u = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const ok = await bcrypt.compare(password.slice(0, 200), u?.passwordHash ?? dummy());
  return u && u.active && ok ? u : null;
}

export const LOGIN_MAX_FAILURES = 8;
export const LOGIN_WINDOW_MS = 15 * 60_000;
/** Opaque per-email key (same for existing and non-existing accounts, so a lockout reveals nothing). */
export const loginKey = (email: string) => createHash("sha256").update("login:" + email.trim().toLowerCase()).digest("hex").slice(0, 40);

/** Failed attempts for this email in the window, from the append-only audit log (survives restarts, shared by all instances). */
export async function recentLoginFailures(email: string) {
  return prisma.auditLog.count({ where: { action: "LOGIN_FAILED", entityType: "login", entityId: loginKey(email), createdAt: { gt: new Date(Date.now() - LOGIN_WINDOW_MS) } } });
}

export const salesPointInput = z.object({ name: z.string().trim().min(2).max(120), location: z.string().trim().max(200).optional().nullable() });

export async function createSalesPoint(actor: Actor, raw: unknown) {
  requireLeader(actor);
  const d = salesPointInput.parse(raw);
  return tx(async (t) => {
    const sp = await t.salesPoint.create({ data: { name: d.name, location: d.location ?? null } });
    await audit(t, actor.id, "SALES_POINT_CREATED", "sales_point", sp.id, { name: sp.name }, actor.ip);
    return sp;
  });
}

export async function setSalesPointMembers(actor: Actor, salesPointId: string, userIds: string[]) {
  requireLeader(actor);
  return tx(async (t) => {
    await t.salesPointMember.deleteMany({ where: { salesPointId, userId: { notIn: userIds } } });
    for (const userId of userIds) await t.salesPointMember.upsert({ where: { userId_salesPointId: { userId, salesPointId } }, create: { userId, salesPointId }, update: {} });
    await audit(t, actor.id, "SALES_POINT_MEMBERS_SET", "sales_point", salesPointId, { userIds }, actor.ip);
  });
}
