import { pageActor } from "@/server/auth";
import { teamEvent } from "@/server/team-data";
import { PageHeader, editionTitle } from "@/components/ui";
import { EventTabs } from "@/components/EventTabs";
import { ScanStation } from "./ScanStation";

export const dynamic = "force-dynamic";

export default async function ScanPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const actor = await pageActor();
  const { event } = await teamEvent(actor, eventId);
  return (
    <>
      <PageHeader title={editionTitle(event)} subtitle={`Entrance check-in · ${event.checkedInCount} / ${event.venueCapacity} inside`} back={{ href: "/team", label: "My events" }} />
      <EventTabs eventId={eventId} current="scan" />
      <ScanStation eventId={eventId} allowReservations={!!event.reservationInventory?.allowReservationAdmission} />
    </>
  );
}
