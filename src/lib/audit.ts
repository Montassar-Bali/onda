import type { Tx } from "./db";
import type { Prisma } from "@prisma/client";

const FORBIDDEN_KEYS = /cin|national|password/i;

/** Strips anything that looks like CIN/password before it can reach the audit log. */
function scrub(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(scrub);
  if (data && typeof data === "object") {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>)
        .filter(([k]) => !FORBIDDEN_KEYS.test(k))
        .map(([k, v]) => [k, scrub(v)]),
    );
  }
  if (typeof data === "string" && /^\d{8}$/.test(data)) return "[redacted]";
  return data;
}

export async function audit(t: Tx, actorId: string | null, action: string, entityType: string, entityId: string | null, data?: Record<string, unknown>, ip?: string | null) {
  await t.auditLog.create({
    data: { actorId, action, entityType, entityId, data: data ? (scrub(data) as Prisma.InputJsonValue) : undefined, ip: ip ?? null },
  });
}
