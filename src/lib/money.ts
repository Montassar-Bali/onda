/**
 * TND money helpers. All amounts are integer MILLIMES (1 TND = 1000 millimes).
 * Floating point is never used for money arithmetic.
 */
export const MILLIMES_PER_TND = 1000;
export const CURRENCY = "TND" as const;

/** Parses "25", "25.5", "25.500" (TND) into integer millimes. Rejects > 3 decimals, negatives, junk. */
export function parseTnd(input: string | number): number {
  const s = String(input).trim().replace(",", ".");
  const m = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(s);
  if (!m) throw new Error(`Invalid TND amount: "${input}" (use up to 3 decimals, e.g. 25.500)`);
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? "").padEnd(3, "0"));
  const v = whole * MILLIMES_PER_TND + frac;
  if (!Number.isSafeInteger(v) || v > 2_000_000_000) throw new Error("Amount too large");
  return v;
}

/** 25500 → "25.500 TND"; -50000 → "-50.000 TND" */
export function formatTnd(millimes: number, withCurrency = true): string {
  if (!Number.isInteger(millimes)) throw new Error("Money must be integer millimes");
  const sign = millimes < 0 ? "-" : "";
  const abs = Math.abs(millimes);
  const whole = Math.floor(abs / MILLIMES_PER_TND).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const frac = String(abs % MILLIMES_PER_TND).padStart(3, "0");
  return `${sign}${whole}.${frac}${withCurrency ? " " + CURRENCY : ""}`;
}

export function sumMillimes(values: number[]): number {
  return values.reduce((a, b) => {
    const r = a + b;
    if (!Number.isSafeInteger(r)) throw new Error("Money overflow");
    return r;
  }, 0);
}
