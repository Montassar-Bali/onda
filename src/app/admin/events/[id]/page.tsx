import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatTnd } from "@/lib/money";
import { eventReport } from "@/services/reports";
import { accountSummaries } from "@/services/cash";
import { Badge, CapacityLedger, Kpi, Kpis, Money, PageHeader, fmtDateTime, editionTitle } from "@/components/ui";
import { EventAdminTabs } from "@/components/EventAdminTabs";
import { ActionButton } from "@/components/client";
import { IconAlert, IconBox, IconCash, IconChart, IconScan, IconTicket, IconUsers } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function EventDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await prisma.event.findUnique({ where: { id } });
  if (!e) notFound();
  const [r, accounts] = await Promise.all([eventReport(id), accountSummaries(id)]);

  // The screen's one finding: the cash that is not yet back in the Team Leader's hands.
  const short = accounts.filter((a) => a.status === "DISCREPANCY").sort((a, b) => b.openDiscrepancyMillimes - a.openDiscrepancyMillimes);
  const toCount = accounts.filter((a) => a.status === "HANDOVER_PENDING");
  const finding = short.length
    ? `${short[0].sellerName} has an open discrepancy of ${formatTnd(short[0].openDiscrepancyMillimes)}${short.length > 1 ? ` (+${short.length - 1} more seller${short.length > 2 ? "s" : ""})` : ""}.`
    : toCount.length ? `${toCount.length} cash handover${toCount.length > 1 ? "s" : ""} waiting to be counted.`
    : r.paid.outstandingSellerCashMillimes > 0 ? `${formatTnd(r.paid.outstandingSellerCashMillimes)} is still with sellers.`
    : "All reported cash is reconciled.";

  const statusActions = (
    <>
      {e.status === "DRAFT" && <ActionButton path={`/admin/events/${id}/status`} body={{ status: "PUBLISHED" }} label="Publish event" className="btn-primary" confirm="Publish this event? Sellers can start selling." />}
      {e.status === "PUBLISHED" && <ActionButton path={`/admin/events/${id}/status`} body={{ status: "CLOSED" }} label="Close sales" confirm="Close the event? Sales stop." />}
      {e.status !== "CANCELLED" && e.status !== "CLOSED" && <ActionButton path={`/admin/events/${id}/status`} body={{ status: "CANCELLED" }} label="Cancel event" className="btn-ghost" confirm="Cancel this event?" />}
      <Link href={`/admin/events/${id}/cash`} className="btn-primary">Count seller cash</Link>
    </>
  );

  return (
    <>
      <PageHeader title={editionTitle(e)} back={{ href: "/admin", label: "All events" }} actions={statusActions}
        subtitle={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><Badge>{e.status}</Badge><span>{fmtDateTime(e.startsAt)}</span><span>{e.venue}</span></span>} />
      <EventAdminTabs id={id} current="" />

      <div className={`mb-6 flex flex-wrap items-center gap-3 rounded-2xl px-5 py-4 ${short.length ? "bg-[var(--neg-bg)] text-[var(--neg-ink)]" : "bg-[var(--primary-soft)] text-[var(--primary-ink)]"}`}>
        <IconAlert size={20} /><span className="text-[15px] font-bold">{finding}</span>
        {(short.length > 0 || toCount.length > 0) && <Link href={`/admin/events/${id}/cash`} className="ml-auto btn h-9 rounded-xl bg-[var(--surface)] px-4 text-[13px] font-bold text-current">Open reconciliation</Link>}
      </div>

      <Kpis>
        <Kpi icon={<IconTicket size={22} />} color="blue" label="Paid tickets sold" value={<>{r.paid.ticketsSold}<small>/ {r.event.paidTicketCapacity}</small></>} note={`${r.paid.paidRemaining} left to sell`} />
        <Kpi icon={<IconChart size={22} />} color="purple" label="Cash reported by sellers" value={<Money m={r.paid.cashReportedCollectedMillimes} />} note={r.paid.reversalsMillimes ? `after ${formatTnd(r.paid.reversalsMillimes)} refunded` : "Sales minus refunds"} />
        <Kpi icon={<IconCash size={22} />} color="green" label="Counted by Team Leader" value={<Money m={r.paid.cashReconciledMillimes} />} note="Physically received" />
        <Kpi icon={<IconAlert size={22} />} color="orange" label="Still with sellers" value={<Money m={r.paid.outstandingSellerCashMillimes} />} tone={r.paid.outstandingSellerCashMillimes > 0 ? "warn" : undefined} note={`${accounts.length} seller account${accounts.length === 1 ? "" : "s"}`} />
      </Kpis>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="card">
            <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-3 text-[17px] font-bold"><span className="tile tile-sm"><IconUsers size={20} /></span>Venue capacity</h2>
              <span className="text-[13px] text-zinc-500"><span className="num font-medium text-zinc-900">{r.attendance.remainingVenueCapacity}</span> places free of {r.event.venueCapacity}</span>
            </header>
            <CapacityLedger venue={r.event.venueCapacity} paidCap={r.event.paidTicketCapacity} paidSold={r.paid.ticketsSold}
              comp={r.complimentary.issued} compCap={r.complimentary.allocation} inside={r.attendance.totalAttendance}
              reservedPending={r.reservations.pendingAttendees} reservedQuota={r.reservations.quota} />
          </section>

          <section className="card">
            <header className="mb-2 flex items-center justify-between"><h2 className="flex items-center gap-3 text-[17px] font-bold"><span className="tile tile-sm tile-green"><IconCash size={20} /></span>Takings</h2><span className="text-[13px] text-zinc-500">Cash reported, by source</span></header>
            <div className="grid gap-x-8 md:grid-cols-3">
              <Breakdown title="By category" rows={r.paid.byCategory.map((c) => [c.category, c.millimes, `${c.count} sold`])} />
              <Breakdown title="By seller" rows={r.paid.bySeller.map((s) => [s.seller, s.millimes])} />
              <Breakdown title="By sales point" rows={r.paid.bySalesPoint.map((s) => [s.salesPoint, s.millimes])} />
            </div>
            <p className="mt-4 text-[13px] text-zinc-500">{r.complimentary.issued} complimentary ticket{r.complimentary.issued === 1 ? "" : "s"} issued, no revenue, kept out of these totals.</p>
          </section>

          <section className="card">
            <header className="mb-5 flex items-center justify-between"><h2 className="flex items-center gap-3 text-[17px] font-bold"><span className="tile tile-sm tile-orange"><IconBox size={20} /></span>Printed tickets</h2><Link href={`/admin/events/${id}/physical`} className="text-[13px] font-medium text-[var(--accent)] hover:underline">Manage batches</Link></header>
            <dl className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
              {([["Generated", r.physical.generated, `${r.physical.batches} batches`], ["Printed", r.physical.printed, ""], ["With sellers", r.physical.assigned, "unsold"], ["Sold & activated", r.physical.sold, ""],
                ["In stock", r.physical.available, ""], ["Returned", r.physical.returned, "awaiting review"], ["Voided", r.physical.voided, ""], ["Unsold total", r.physical.unsold, ""]] as const).map(([k, v, s]) => (
                <div key={k}><dt className="text-[13px] text-zinc-500">{k}</dt><dd className="num mt-0.5 text-[22px] font-extrabold">{v}{s && <span className="ml-1.5 text-[12px] font-normal text-zinc-500">{s}</span>}</dd></div>
              ))}
            </dl>
          </section>
        </div>

        <aside className="space-y-6">
          <div>
            <div className="mb-2 flex items-baseline justify-between"><h2 className="text-[17px] font-bold">Seller cash</h2><Link href={`/admin/events/${id}/cash`} className="text-[13px] font-medium text-[var(--accent)] hover:underline">View all</Link></div>
            <div className="card py-1">
              {accounts.length === 0 && <p className="py-6 text-center text-zinc-500">No cash sales yet.</p>}
              {accounts.slice(0, 6).map((a, i) => (
                <Link key={a.accountId} href={`/admin/events/${id}/cash/${a.accountId}`} className={`flex items-center gap-3 py-3 ${i ? "border-t border-[var(--rule)]" : ""}`}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[14px] font-bold text-white" style={{ background: ["#e1102a", "#140b0d", "#ff8a3d", "#9b0015", "#ff3d5a"][i % 5] }}>{a.sellerName.charAt(0)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.sellerName}</span><span className="block text-[12px] text-zinc-500">{a.ticketsSold} tickets · <Badge>{a.status}</Badge></span></span>
                  <span className="text-right"><Money m={a.outstandingMillimes} className="font-medium" /><span className="block text-[12px] text-zinc-500">owed</span></span>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-3 flex items-center gap-2 text-[17px] font-bold"><IconScan size={18} />At the gate</h2>
            <div className="card space-y-3">
              <Line k="Paid ticket holders in" v={r.attendance.paidCheckedIn} />
              <Line k="Complimentary in" v={r.attendance.complimentaryCheckedIn} />
              <Line k="Unpaid reservations admitted" v={r.attendance.reservationAdmissions} />
              <Line k="Repeat scans refused" v={r.attendance.duplicateScans} warn={r.attendance.duplicateScans > 0} />
              <Line k="Unsold printed tickets scanned" v={r.attendance.unsoldScans} warn={r.attendance.unsoldScans > 0} />
            </div>
          </div>

          <div>
            <h2 className="mb-3 flex items-center gap-2 text-[17px] font-bold"><IconUsers size={18} />Reservations</h2>
            <div className="card space-y-3">
              <p className="text-[13px] text-zinc-500">Unpaid, separate quota, never counted as revenue.</p>
              <Line k="Waiting to pay" v={r.reservations.pending} />
              <Line k="Paid in cash (converted)" v={r.reservations.converted} />
              <Line k="Expired" v={r.reservations.expired} />
              <Line k="Cancelled" v={r.reservations.cancelled} />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function Line({ k, v, warn }: { k: string; v: number; warn?: boolean }) {
  return <div className="flex items-baseline justify-between gap-3"><span className="text-zinc-600">{k}</span><span className={`num font-medium ${warn ? "text-[var(--negative)]" : v === 0 ? "text-zinc-400" : ""}`}>{v}</span></div>;
}

function Breakdown({ title, rows }: { title: string; rows: [string, number, string?][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="pt-3">
      <h3 className="mb-2 text-[13px] text-zinc-500">{title}</h3>
      {rows.length === 0 ? <p className="text-zinc-400">—</p> : rows.map(([k, v, s]) => (
        <div key={k} className="py-1.5">
          <div className="flex items-baseline justify-between gap-2"><span className="truncate">{k}{s && <span className="ml-1.5 text-[12px] text-zinc-500">{s}</span>}</span><Money m={v} className="text-[13px] font-medium" /></div>
          <div className="mt-1.5 h-2 rounded-full bg-[var(--primary-track)]"><div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${(v / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
