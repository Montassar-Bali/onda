import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { accountSummaries } from "@/services/cash";
import { pageActor } from "@/server/auth";
import { Badge, Money, PageHeader, Section, Stat, fmtDateTime, editionTitle } from "@/components/ui";
import { EventAdminTabs } from "@/components/EventAdminTabs";
import { ActionButton, ApiForm } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function CashPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await pageActor("TEAM_LEADER");
  const e = await prisma.event.findUnique({ where: { id } });
  if (!e) notFound();
  const accounts = await accountSummaries(id);
  const pending = await prisma.cashHandover.findMany({ where: { status: "SUBMITTED", account: { eventId: id } } });
  const discrepancies = await prisma.cashDiscrepancy.findMany({ where: { account: { eventId: id } }, orderBy: { createdAt: "desc" }, include: { account: { include: { seller: { select: { name: true } } } } } });
  const sum = (k: "expectedMillimes" | "reconciledMillimes" | "outstandingMillimes") => accounts.reduce((s, a) => s + a[k], 0);
  return (
    <>
      <PageHeader title={editionTitle(e)} subtitle="Cash reconciliation — only a Team Leader confirms cash physically received" back={{ href: "/admin", label: "Events" }} />
      <EventAdminTabs id={id} current="cash" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Expected (all sellers)" value={<Money m={sum("expectedMillimes")} />} />
        <Stat label="Reconciled" value={<Money m={sum("reconciledMillimes")} />} tone="good" />
        <Stat label="Outstanding" value={<Money m={sum("outstandingMillimes")} />} tone={sum("outstandingMillimes") ? "warn" : "good"} />
        <Stat label="Open discrepancies" value={discrepancies.filter((d) => d.status !== "RESOLVED").length} tone={discrepancies.some((d) => d.status !== "RESOLVED") ? "bad" : "default"} />
      </div>
      <div className="space-y-4">
        {accounts.length === 0 && <div className="card text-zinc-500">No cash sales recorded yet.</div>}
        {accounts.map((a) => {
          const h = pending.find((p) => p.accountId === a.accountId);
          const own = a.sellerId === actor.id;
          return (
            <div key={a.accountId} className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><span className="text-lg font-semibold">{a.sellerName}</span> <Badge>{a.status}</Badge></div>
                <Link className="text-sm text-brand-700 hover:underline" href={`/admin/events/${id}/cash/${a.accountId}`}>Sales & history →</Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                <div>Tickets sold: <b>{a.ticketsSold}</b></div>
                <div>Expected: <Money m={a.expectedMillimes} className="font-semibold" /></div>
                <div>Received: <Money m={a.reconciledMillimes} className="font-semibold" /></div>
                <div>Outstanding: <Money m={a.outstandingMillimes} className="font-bold" /></div>
              </div>
              {own ? (
                <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600">This is your own cash account — another Team Leader must count and reconcile it.</p>
              ) : (
                <div className="mt-4 rounded-xl border border-zinc-200 p-4">
                  {h && <p className="mb-2 text-sm">Seller declared a handover of <Money m={h.declaredMillimes} className="font-semibold" /> on {fmtDateTime(h.createdAt)}{h.note ? ` — “${h.note}”` : ""}.</p>}
                  <ApiForm path="/admin/cash/reconcile" extra={{ accountId: a.accountId, handoverId: h?.id ?? null }} submitLabel="Record counted cash" className="grid gap-3 sm:grid-cols-4 sm:items-end" successMessage="Reconciliation recorded">
                    <div><label className="label">Cash physically counted (TND)</label><input name="counted" className="input" inputMode="decimal" placeholder="0.000" required /></div>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isFinal" /> Final settlement for this event</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requireExplanation" defaultChecked /> Require explanation if discrepancy</label>
                    <div className="sm:col-span-4"><label className="label">Note</label><input name="note" className="input" /></div>
                  </ApiForm>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {discrepancies.length > 0 && (
        <div className="mt-6"><Section title="Discrepancies">
          <table className="table"><thead><tr><th>Seller</th><th>Amount</th><th>Type</th><th>Status</th><th>Explanation</th><th></th></tr></thead>
            <tbody>{discrepancies.map((d) => (
              <tr key={d.id}>
                <td>{d.account.seller.name}</td><td><Money m={d.amountMillimes} className="font-semibold" /></td><td className="text-xs">{d.kind.replaceAll("_", " ").toLowerCase()}</td>
                <td><Badge>{d.status}</Badge></td><td className="max-w-xs text-xs">{d.explanation ?? "—"}{d.resolutionNote && <div className="text-zinc-500">Resolution: {d.resolutionNote}</div>}</td>
                <td className="space-x-1 whitespace-nowrap">
                  {d.status === "OPEN" && <ActionButton path={`/admin/cash/discrepancies/${d.id}/require-explanation`} label="Require explanation" />}
                  {d.status !== "RESOLVED" && <ActionButton path={`/admin/cash/discrepancies/${d.id}/resolve`} label="Close review" prompt="Resolution note (the seller's balance is NOT changed)" promptKey="note" />}
                </td>
              </tr>
            ))}</tbody></table>
        </Section></div>
      )}
    </>
  );
}
