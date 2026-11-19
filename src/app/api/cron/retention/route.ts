import { NextResponse, type NextRequest } from "next/server";
import { purgeExpiredIdentities } from "@/services/identity";
import { cronAuthorized, cronDenied } from "@/server/cron";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return cronDenied();
  return NextResponse.json({ purged: await purgeExpiredIdentities() });
}
