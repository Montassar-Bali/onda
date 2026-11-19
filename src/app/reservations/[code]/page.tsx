import { notFound } from "next/navigation";
import { publicReservationStatus } from "@/services/reservations";
import { PublicShell } from "@/components/PublicShell";
import { Badge, Money, fmtDateTime, editionTitle } from "@/components/ui";
import { CancelReservation } from "./CancelReservation";

export const dynamic = "force-dynamic";

export default async function ReservationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const r = await publicReservationStatus(decodeURIComponent(code));
  if (!r) notFound();
  return (
    <PublicShell>
      <div className="mx-auto max-w-xl space-y-5 bg-[var(--surface)] p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3"><h1 className="text-[28px] font-bold tracking-[-0.025em]">Your reservation</h1><Badge>{r.status}</Badge></div>
        <div className="rounded-md bg-[var(--warn-bg)] p-4 text-[14px] leading-5 text-[var(--warn-ink)]"><b>Unpaid, so this is not a ticket.</b> It does not guarantee entry; paid ticket holders come first.</div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-[15px]">
          <dt className="text-zinc-500">Event</dt><dd>{editionTitle(r.event)}</dd>
          <dt className="text-zinc-500">Date</dt><dd>{fmtDateTime(r.event.startsAt)}</dd>
          <dt className="text-zinc-500">Category</dt><dd>{r.category.name} (<Money m={r.category.priceMillimes} /> each, cash)</dd>
          <dt className="text-zinc-500">Attendees</dt><dd>{r._count.attendees}</dd>
          <dt className="text-zinc-500">Expires</dt><dd>{fmtDateTime(r.expiresAt)}</dd>
          <dt className="text-zinc-500">Code</dt><dd className="num">{r.code}</dd>
        </dl>
        {r.status === "PENDING" && <p className="text-[15px] leading-6">To get valid tickets, present this code and every attendee&apos;s national ID to an authorized seller and pay <Money m={r.category.priceMillimes * r._count.attendees} /> in cash.</p>}
        {r.status === "PENDING" && <CancelReservation code={r.code} />}
      </div>
    </PublicShell>
  );
}
