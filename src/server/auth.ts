import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { activeSession } from "@/services/sessions";
import { clientIp } from "./ip";
import type { Actor } from "@/services/types";

/**
 * Resolves the current user: a valid signed cookie AND a live server-side session AND an active
 * user. Role and name always come from the database, never from the cookie.
 */
export async function currentActor(): Promise<Actor | null> {
  const claims = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const s = await activeSession(claims.sid, claims.sub);
  if (!s) return null;
  return { id: s.user.id, role: s.user.role, name: s.user.name, ip: clientIp(await headers()) };
}

/** For server components: redirects to /login if not authorized. */
export async function pageActor(role?: Role): Promise<Actor> {
  const a = await currentActor();
  if (!a) redirect("/login");
  if (role && a.role !== role) redirect(a.role === "TEAM_LEADER" ? "/admin" : "/team");
  return a;
}
