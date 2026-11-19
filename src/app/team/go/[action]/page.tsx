import { redirect } from "next/navigation";
import { pageActor } from "@/server/auth";
import { teamEvents } from "@/server/team-data";

/** Bottom-nav shortcuts: open Sell / Scan for the next event this team member works. */
export default async function Go({ params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const actor = await pageActor();
  const events = await teamEvents(actor);
  const tab = ["sell", "scan", "activate", "reservations"].includes(action) ? action : "sell";
  if (events.length === 0) redirect("/team");
  redirect(`/team/${events[0].id}/${tab}`);
}
