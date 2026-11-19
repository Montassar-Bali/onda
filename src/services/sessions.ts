import { prisma } from "@/lib/db";
import { SESSION_TTL_SECONDS } from "@/lib/session";

export async function createSession(userId: string, ip: string | null, userAgent: string | null) {
  return prisma.session.create({
    data: { userId, ip, userAgent: userAgent?.slice(0, 300) ?? null, expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) },
  });
}

/** The session and its user, only if the session is live and the user is still active. */
export async function activeSession(sid: string, userId: string) {
  const s = await prisma.session.findUnique({ where: { id: sid }, include: { user: true } });
  if (!s || s.userId !== userId || s.revokedAt || s.expiresAt <= new Date() || !s.user.active) return null;
  return s;
}

export async function revokeSession(sid: string) {
  await prisma.session.updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllSessions(userId: string) {
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
