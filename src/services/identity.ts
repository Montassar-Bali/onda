import type { Tx } from "@/lib/db";
import { prisma } from "@/lib/db";
import { cinDigest, decryptCin, encryptCin } from "@/lib/cin";
import { audit } from "@/lib/audit";
import { forbidden, notFound, invalid } from "@/lib/errors";
import type { PersonInput } from "@/lib/validation";
import type { Actor } from "./types";

const RETENTION_DAYS = () => Number(process.env.CIN_RETENTION_DAYS ?? 365);

/**
 * Finds (by keyed HMAC of the CIN) or creates the identity record. A name differing from the
 * stored one is reported as a duplicate-detection warning — the same CIN with a different name
 * needs human attention.
 *
 * SECURITY: contact details (email, phone) of an EXISTING identity are only refreshed when the
 * caller has verified the person (a seller who saw the ID card: `trustedContact: true`).
 * Public flows must never overwrite them — otherwise anyone who knows a victim's CIN could
 * redirect the victim's ticket emails to their own address.
 */
export async function upsertIdentity(t: Tx, p: PersonInput, retainUntilAtLeast: Date, opts: { trustedContact: boolean } = { trustedContact: true }) {
  const hmac = cinDigest(p.cin);
  const retention = new Date(retainUntilAtLeast.getTime() + RETENTION_DAYS() * 86400_000);
  const existing = await t.customerIdentityRecord.findUnique({ where: { cinHmac: hmac } });
  if (existing) {
    const nameMismatch = normalizeName(existing.fullName) !== normalizeName(p.fullName);
    const identity = await t.customerIdentityRecord.update({
      where: { id: existing.id },
      data: {
        ...(opts.trustedContact ? { phone: p.phone, email: p.email } : {}),
        retentionUntil: existing.retentionUntil > retention ? existing.retentionUntil : retention,
      },
    });
    return { identity, nameMismatch, storedName: existing.fullName };
  }
  const enc = encryptCin(p.cin);
  const identity = await t.customerIdentityRecord.create({
    data: {
      fullName: p.fullName, phone: p.phone, email: p.email,
      cinCiphertext: new Uint8Array(enc.ciphertext), cinIv: new Uint8Array(enc.iv), cinTag: new Uint8Array(enc.tag), cinKeyVersion: enc.keyVersion,
      cinHmac: enc.hmac, cinLast3: enc.last3, retentionUntil: retention,
    },
  });
  return { identity, nameMismatch: false, storedName: identity.fullName };
}

const normalizeName = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Rejects a batch of attendees that contains the same CIN twice. */
export function assertDistinctCins(people: PersonInput[]) {
  const seen = new Set<string>();
  for (const p of people) {
    if (seen.has(p.cin)) throw invalid("DUPLICATE_CIN_IN_REQUEST", "The same national ID appears more than once in this request");
    seen.add(p.cin);
  }
}

/** Team Leader only: full CIN reveal, always logged with a reason. */
export async function revealCin(actor: Actor, identityId: string, reason: string) {
  if (actor.role !== "TEAM_LEADER") throw forbidden("Only a Team Leader can view a full national ID");
  if (reason.trim().length < 5) throw invalid("REASON_REQUIRED", "A reason is required to view a full national ID");
  return prisma.$transaction(async (t) => {
    const rec = await t.customerIdentityRecord.findUnique({ where: { id: identityId } });
    if (!rec) throw notFound();
    await t.identityAccessLog.create({ data: { identityId, accessedById: actor.id, action: "REVEAL_FULL_CIN", reason, ip: actor.ip ?? null } });
    if (!rec.cinCiphertext || !rec.cinIv || !rec.cinTag) throw invalid("CIN_PURGED", "This national ID was purged under the retention policy");
    return decryptCin({ ciphertext: rec.cinCiphertext, iv: rec.cinIv, tag: rec.cinTag });
  });
}

/** Team Leader only: look up an identity by CIN (via HMAC — no decryption needed), logged. */
export async function lookupByCin(actor: Actor, cin: string, reason: string) {
  if (actor.role !== "TEAM_LEADER") throw forbidden();
  return prisma.$transaction(async (t) => {
    const rec = await t.customerIdentityRecord.findUnique({ where: { cinHmac: cinDigest(cin) } });
    await t.identityAccessLog.create({ data: { identityId: rec?.id ?? null, accessedById: actor.id, action: "LOOKUP_BY_CIN", reason, ip: actor.ip ?? null } });
    await audit(t, actor.id, "IDENTITY_LOOKUP", "customer_identity", rec?.id ?? null, { found: !!rec }, actor.ip);
    return rec;
  });
}

/** Matches a presented CIN against a stored identity without decrypting (gate check for reservations). */
export async function identityMatches(identityId: string, presentedCin: string) {
  const rec = await prisma.customerIdentityRecord.findUnique({ where: { id: identityId }, select: { cinHmac: true } });
  return !!rec?.cinHmac && rec.cinHmac === cinDigest(presentedCin);
}

/** Crypto-shreds CIN data for identities past retention with no upcoming events. */
export async function purgeExpiredIdentities(now = new Date()) {
  const due = await prisma.customerIdentityRecord.findMany({
    where: { purgedAt: null, retentionUntil: { lt: now } },
    select: { id: true },
  });
  for (const { id } of due) {
    await prisma.$transaction(async (t) => {
      await t.customerIdentityRecord.update({
        where: { id },
        data: { cinCiphertext: null, cinIv: null, cinTag: null, cinHmac: null, cinLast3: null, purgedAt: now },
      });
      await audit(t, null, "CIN_PURGED_RETENTION", "customer_identity", id);
    });
  }
  return due.length;
}
