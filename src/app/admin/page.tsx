import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Kpi, Kpis, Money, PageHeader, Track, fmtDateTime, editionTitle } from "@/components/ui";
import { ThemePoster } from "@/components/ThemePoster";
import { IconAlert, IconCalendar, IconCash, IconMapPin, IconPlus, IconTicket } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const events = await prisma.event.findMany({ orderBy: { startsAt: "desc" }, include: { cashAccounts: true, reservationInventory: true } });
  const owed = (e: (typeof events)[number]) => e.cashAccounts.reduce((s, a) => s + a.expectedMillimes - a.reconciledMillimes, 0);
  const live = events.filter((e) => e.status === "PUBLISHED");
  return (
    <>
      <PageHeader title="Events" subtitle="Every ticket, every sale, every dinar and every entry." actions={<Link href="/admin/events/new" className="btn-primary h-12 px-5"><IconPlus size={18} />New event</Link>} />
      <Kpis>
        <Kpi icon={<IconCalendar size={22} />} label="On sale" value={live.length} note={`${events.length} event${events.length === 1 ? "" : "s"} in total`} />
        <Kpi icon={<IconTicket size={22} />} color="green" label="Paid tickets sold" value={live.reduce((s, e) => s + e.paidSoldCount, 0)} note="Across events on sale" />
        <Kpi icon={<IconCash size={22} />} color="orange" label="Cash still with sellers" value={<Money m={events.reduce((s, e) => s + owed(e), 0)} />} note="Reported, not yet counted" />
        <Kpi icon={<IconAlert size={22} />} color="coral" label="Reservations waiting" value={live.reduce((s, e) => s + (e.reservationInventory?.pendingAttendees ?? 0), 0)} note="Unpaid places held" />
      </Kpis>
      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {events.length === 0 && <div className="empty md:col-span-2">No events yet. Create the first one.</div>}
        {events.map((e) => (
          <Link key={e.id} href={`/admin/events/${e.id}`} className="card lift block p-3">
            <ThemePoster id={e.id} theme={e.theme} color={e.themeColor} name={e.name} size="sm" className="h-40 rounded-2xl">
              <span className="absolute left-3 top-3"><Badge>{e.status}</Badge></span>
            </ThemePoster>
            <div className="px-2 pb-2 pt-4">
              <h2 className="line-clamp-1 text-[18px] font-bold">{editionTitle(e)}</h2>
              <p className="mt-1 flex items-center gap-1.5 truncate text-[13px] text-zinc-500"><IconMapPin size={14} />{fmtDateTime(e.startsAt)} · {e.venue}</p>
              <div className="mt-4 space-y-3 text-[13px]">
                <div><div className="mb-1.5 flex justify-between"><span className="text-zinc-500">Paid sold</span><span className="num font-bold">{e.paidSoldCount}/{e.paidTicketCapacity}</span></div><Track value={e.paidSoldCount} of={e.paidTicketCapacity} /></div>
                <div><div className="mb-1.5 flex justify-between"><span className="text-zinc-500">Inside</span><span className="num font-bold">{e.checkedInCount}/{e.venueCapacity}</span></div><Track value={e.checkedInCount} of={e.venueCapacity} tone="warn" /></div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-[var(--ground)] px-3 py-2.5 text-[13px]"><span className="text-zinc-500">With sellers</span><Money m={owed(e)} className="font-bold" /></div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
