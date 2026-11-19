import { pageActor } from "@/server/auth";
import { teamEvent } from "@/server/team-data";
import { PageHeader, editionTitle } from "@/components/ui";
import { EventTabs } from "@/components/EventTabs";
import { SellForm } from "./SellForm";

export const dynamic = "force-dynamic";

export default async function SellPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const actor = await pageActor();
  const { event, salesPoints } = await teamEvent(actor, eventId);
  return (
    <>
      <PageHeader title={editionTitle(event)} subtitle="Cash sale — digital ticket" back={{ href: "/team", label: "My events" }} />
      <EventTabs eventId={eventId} current="sell" />
      <SellForm eventId={eventId} maxPerSale={Math.min(event.maxTicketsPerIdentity * 5, 20)} remaining={event.paidTicketCapacity - event.paidSoldCount}
        categories={event.categories.map((c) => ({ id: c.id, name: c.name, priceMillimes: c.priceMillimes }))} salesPoints={salesPoints.map((s) => ({ id: s.id, name: s.name }))} />
    </>
  );
}
