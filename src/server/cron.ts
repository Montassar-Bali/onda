import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Anything else is refused. */
export function cronAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
export const cronDenied = () => NextResponse.json({ error: { code: "FORBIDDEN", message: "Forbidden" } }, { status: 403 });
