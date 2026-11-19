import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * National ID (CIN) protection.
 *  - AES-256-GCM authenticated encryption at rest (key: CIN_ENC_KEY, versioned)
 *  - HMAC-SHA256 keyed digest for lookup / duplicate detection (key: CIN_HMAC_KEY)
 *  - Only the last 3 digits are kept in clear, for masked display
 * Tunisian CIN: exactly 8 digits.
 */

function key(name: "CIN_ENC_KEY" | "CIN_HMAC_KEY"): Buffer {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not configured`);
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error(`${name} must be base64 of exactly 32 bytes`);
  return k;
}

export function normalizeCin(input: string): string {
  const c = input.replace(/[\s-]/g, "");
  if (!/^\d{8}$/.test(c)) throw new Error("CIN must be exactly 8 digits");
  return c;
}

export function isValidCin(input: string): boolean {
  try { normalizeCin(input); return true; } catch { return false; }
}

export function cinDigest(cin: string): string {
  return createHmac("sha256", key("CIN_HMAC_KEY")).update("cin:v1:" + normalizeCin(cin)).digest("hex");
}

export function digestsEqual(a: string, b: string) {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface EncryptedCin { ciphertext: Buffer; iv: Buffer; tag: Buffer; keyVersion: number; hmac: string; last3: string }

export function encryptCin(cin: string, recordAad = "customer_identity"): EncryptedCin {
  const c = normalizeCin(cin);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("CIN_ENC_KEY"), iv);
  cipher.setAAD(Buffer.from(recordAad));
  const ciphertext = Buffer.concat([cipher.update(c, "utf8"), cipher.final()]);
  return {
    ciphertext, iv, tag: cipher.getAuthTag(),
    keyVersion: Number(process.env.CIN_ENC_KEY_VERSION ?? 1),
    hmac: cinDigest(c), last3: c.slice(-3),
  };
}

export function decryptCin(e: { ciphertext: Uint8Array; iv: Uint8Array; tag: Uint8Array }, recordAad = "customer_identity"): string {
  const d = createDecipheriv("aes-256-gcm", key("CIN_ENC_KEY"), Buffer.from(e.iv));
  d.setAAD(Buffer.from(recordAad));
  d.setAuthTag(Buffer.from(e.tag));
  return Buffer.concat([d.update(Buffer.from(e.ciphertext)), d.final()]).toString("utf8");
}

export function maskCin(last3: string | null | undefined): string {
  return last3 ? `•••••${last3}` : "[purged]";
}
