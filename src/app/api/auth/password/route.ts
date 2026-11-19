import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { activeSession } from "@/services/sessions";
import { LOGIN_MAX_FAILURES, loginKey, recentLoginFailures } from "@/services/users";
import { clientIp } from "@/server/ip";

const input = z.object({ current: z.string().min(1).max(200), next: z.string().min(12, "New password must be at least 12 characters").max(200) });
const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

/** Change my password: needs the current one, then revokes every other session of this user. */
export async function POST(req: NextRequest) {
  const claims = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const s = claims && (await activeSession(claims.sid, claims.sub));
  if (!s) return fail(401, "UNAUTHENTICATED", "Please sign in");
  const parsed = input.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(400, "VALIDATION", parsed.error.issues.map((i) => i.message).join("; "));
  const { current, next } = parsed.data;
  const ip = clientIp(req.headers);

  if ((await recentLoginFailures(s.user.email)) >= LOGIN_MAX_FAILURES) return fail(429, "LOCKED", "Too many failed attempts. Try again in 15 minutes.");
  if (!(await bcrypt.compare(current, s.user.passwordHash))) {
    await prisma.auditLog.create({ data: { action: "LOGIN_FAILED", entityType: "login", entityId: loginKey(s.user.email), ip } });
    return fail(403, "WRONG_PASSWORD", "Current password is incorrect");
  }
  if (current === next) return fail(400, "SAME_PASSWORD", "Choose a different password");

  await prisma.$transaction([
    prisma.user.update({ where: { id: s.user.id }, data: { passwordHash: await bcrypt.hash(next, 12) } }),
    prisma.session.updateMany({ where: { userId: s.user.id, revokedAt: null, id: { not: s.id } }, data: { revokedAt: new Date() } }),
    prisma.auditLog.create({ data: { actorId: s.user.id, action: "PASSWORD_CHANGED", entityType: "user", entityId: s.user.id, ip } }),
  ]);
  return NextResponse.json({ ok: true });
}
