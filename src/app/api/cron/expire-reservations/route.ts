import { NextResponse, type NextRequest } from "next/server";
import { expireDueReservations } from "@/services/reservations";
import { cronAuthorized, cronDenied } from "@/server/cron";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return cronDenied();
  return NextResponse.json({ expired: await expireDueReservations() });
}
