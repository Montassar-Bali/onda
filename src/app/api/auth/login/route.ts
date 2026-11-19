import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_MAX_FAILURES, loginKey, recentLoginFailures, verifyCredentials } from "@/services/users";
import { createSession } from "@/services/sessions";
import { SESSION_COOKIE, cookieOptions, signSession } from "@/lib/session";
import { rateLimit } from "@/server/rate-limit";
import { clientIp } from "@/server/ip";
import { prisma } from "@/lib/db";

const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  // Per-IP limit only when the IP is trustworthy (see server/ip.ts); the per-email lockout below always applies.
  if (ip && !rateLimit(`login:${ip}`, 20, 15 * 60_000)) return fail(429, "RATE_LIMITED", "Too many attempts. Wait 15 minutes.");

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return fail(400, "INVALID_CREDENTIALS", "Invalid email or password");

  if ((await recentLoginFailures(email)) >= LOGIN_MAX_FAILURES) {
    return fail(429, "LOCKED", "Too many failed attempts for this account. Try again in 15 minutes.");
  }

  const user = await verifyCredentials(email, password);
  if (!user) {
    await prisma.auditLog.create({ data: { action: "LOGIN_FAILED", entityType: "login", entityId: loginKey(email), ip } });
    return fail(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const session = await createSession(user.id, ip, req.headers.get("user-agent"));
  await prisma.auditLog.create({ data: { actorId: user.id, action: "LOGIN_SUCCESS", entityType: "user", entityId: user.id, ip } });
  const res = NextResponse.json({ role: user.role, redirect: user.role === "TEAM_LEADER" ? "/admin" : "/team" });
  res.cookies.set(SESSION_COOKIE, await signSession({ sub: user.id, sid: session.id, role: user.role, name: user.name }), cookieOptions);
  return res;
}
