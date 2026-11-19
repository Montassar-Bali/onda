import { pageActor } from "@/server/auth";
import { teamEvent } from "@/server/team-data";
import { PageHeader, editionTitle } from "@/components/ui";
import { EventTabs } from "@/components/EventTabs";
import { prisma } from "@/lib/db";
import { ActivateFlow } from "./ActivateFlow";

export const dynamic = "force-dynamic";

export default async function ActivatePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const actor = await pageActor();
  const { event, salesPoints } = await teamEvent(actor, eventId);
  const mine = await prisma.ticket.count({ where: { eventId, kind: "PHYSICAL", inventoryStatus: "ASSIGNED", OR: [{ assignedSellerId: actor.id }, { assignedSalesPointId: { in: salesPoints.map((s) => s.id) } }] } });
  return (
    <>
      <PageHeader title={editionTitle(event)} subtitle={`Sell a pre-printed ticket · ${mine} unsold printed ticket(s) assigned to you or your sales point`} back={{ href: "/team", label: "My events" }} />
      <EventTabs eventId={eventId} current="activate" />
      <ActivateFlow />
    </>
  );
}
