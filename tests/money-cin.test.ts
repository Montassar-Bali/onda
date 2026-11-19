import { describe, expect, it } from "vitest";
import { formatTnd, parseTnd, sumMillimes } from "@/lib/money";
import { cinDigest, decryptCin, encryptCin, maskCin, normalizeCin } from "@/lib/cin";

describe("TND money (integer millimes)", () => {
  it("parses and formats", () => {
    expect(parseTnd("25.500")).toBe(25500);
    expect(parseTnd("25,5")).toBe(25500);
    expect(parseTnd(25)).toBe(25000);
    expect(parseTnd("0.001")).toBe(1);
    expect(formatTnd(25500)).toBe("25.500 TND");
    expect(formatTnd(750000)).toBe("750.000 TND");
    expect(formatTnd(1234567)).toBe("1 234.567 TND");
    expect(formatTnd(-50000)).toBe("-50.000 TND");
  });
  it("rejects invalid amounts and floats", () => {
    expect(() => parseTnd("25.5001")).toThrow();
    expect(() => parseTnd("-3")).toThrow();
    expect(() => parseTnd("abc")).toThrow();
    expect(() => formatTnd(1.5)).toThrow();
  });
  it("avoids floating point errors", () => {
    expect(sumMillimes([100, 200])).toBe(300); // 0.1 + 0.2 TND exactly
  });
});

describe("CIN protection", () => {
  it("validates 8 digits", () => {
    expect(normalizeCin("0912 3456")).toBe("09123456");
    expect(() => normalizeCin("1234567")).toThrow();
    expect(() => normalizeCin("1234567a")).toThrow();
  });
  it("encrypts with AES-GCM and decrypts; ciphertext never contains plaintext", () => {
    const e = encryptCin("09123456");
    expect(e.ciphertext.toString("utf8")).not.toContain("09123456");
    expect(decryptCin(e)).toBe("09123456");
    expect(e.last3).toBe("456");
    expect(maskCin(e.last3)).toBe("•••••456");
  });
  it("detects tampering (authenticated encryption)", () => {
    const e = encryptCin("09123456");
    e.ciphertext[0] ^= 1;
    expect(() => decryptCin(e)).toThrow();
  });
  it("HMAC digest is deterministic and keyed", () => {
    expect(cinDigest("09123456")).toBe(cinDigest("0912-3456"));
    expect(cinDigest("09123456")).not.toBe(cinDigest("09123457"));
    expect(cinDigest("09123456")).toMatch(/^[0-9a-f]{64}$/);
  });
});
