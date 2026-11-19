import { randomBytes } from "node:crypto";

/** 256-bit opaque, unpredictable QR token. Contains no personal or ticket data. */
export const newQrToken = () => randomBytes(32).toString("base64url");
/** Customer-facing reservation code (opaque, ~96 bits). */
export const newReservationCode = () => "R-" + randomBytes(12).toString("base64url");

/**
 * Manual entry code printed under the QR, typed in when a QR will not scan.
 * 12 characters from a 32-letter alphabet without look-alikes (no 0/O, 1/I): 60 bits of randomness.
 * 256 % 32 === 0, so mapping random bytes onto the alphabet has no bias.
 */
export const MANUAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newManualCode(): string {
  const bytes = randomBytes(12);
  let out = "";
  for (const b of bytes) out += MANUAL_ALPHABET[b % 32];
  return out;
}
/** "k7qm 4xr2-ph9t" → "K7QM4XR2PH9T", or null if it cannot be a manual code. */
export function normalizeManualCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-HJ-NP-Z2-9]{12}$/.test(s) ? s : null;
}
/** "K7QM4XR2PH9T" → "K7QM-4XR2-PH9T" */
export const formatManualCode = (c: string) => c.replace(/(.{4})(?=.)/g, "$1-");
