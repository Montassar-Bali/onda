import { pageActor } from "@/server/auth";
import { teamEvent } from "@/server/team-data";
import { PageHeader, editionTitle } from "@/components/ui";
import { EventTabs } from "@/components/EventTabs";
import { ReservationDesk } from "./ReservationDesk";

export const dynamic = "force-dynamic";

export default async function TeamReservationsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const actor = await pageActor();
  const { event, salesPoints } = await teamEvent(actor, eventId);
  return (
    <>
      <PageHeader title={editionTitle(event)} subtitle="Look up an unpaid reservation and convert it into paid tickets (cash)" back={{ href: "/team", label: "My events" }} />
      <EventTabs eventId={eventId} current="reservations" />
      <ReservationDesk salesPoints={salesPoints.map((s) => ({ id: s.id, name: s.name }))} />
    </>
  );
}
