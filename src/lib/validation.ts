import { z } from "zod";
import { isValidCin, normalizeCin } from "./cin";
import { parseTnd } from "./money";

export const cinSchema = z.string().refine(isValidCin, "CIN must be exactly 8 digits").transform(normalizeCin);
export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s.-]/g, ""))
  .refine((s) => /^(\+216|00216)?[2-9]\d{7}$/.test(s), "Enter a valid Tunisian phone number (8 digits, optionally +216)")
  .transform((s) => "+216" + s.slice(-8));

/** Required identity data for every ticket holder and reservation attendee. */
export const personSchema = z.object({
  fullName: z.string().trim().min(3, "Full name is required").max(120),
  cin: cinSchema,
  phone: phoneSchema,
  email: z.string().trim().toLowerCase().email("Valid email is required").max(200),
});
export type PersonInput = z.infer<typeof personSchema>;

export const tndSchema = z.union([z.string(), z.number()]).transform((v, ctx) => {
  try { return parseTnd(v); } catch (e) { ctx.addIssue({ code: "custom", message: (e as Error).message }); return z.NEVER; }
});

export const uuid = z.string().uuid();
