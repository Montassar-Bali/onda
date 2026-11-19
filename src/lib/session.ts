import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

/** `__Host-` prefix in production: the cookie is Secure, host-only and path=/ — it cannot be set by subdomains. */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-onda_session" : "onda_session";
export const SESSION_TTL_SECONDS = 12 * 3600;

/** The cookie carries a signed reference to a server-side session row (sid); the row is checked on every request. */
export interface SessionClaims { sub: string; sid: string; role: Role; name: string }

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (>= 32 chars)");
  return new TextEncoder().encode(s);
};

export async function signSession(c: SessionClaims) {
  return new SignJWT({ role: c.role, name: c.name, sid: c.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
    return { sub: payload.sub, sid: payload.sid, role: payload.role as Role, name: String(payload.name) };
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
