import { pageActor } from "@/server/auth";
import { prisma } from "@/lib/db";
import { Badge, Money, PageHeader, Section, fmtDateTime, editionTitle } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { HandoverForm, ReturnTickets } from "./forms";

export const dynamic = "force-dynamic";

export default async function MyCash() {
  const actor = await pageActor();
  const accounts = await prisma.sellerCashAccount.findMany({
    where: { sellerId: actor.id },
    include: {
      event: { select: { name: true, theme: true, id: true } },
      handovers: { orderBy: { createdAt: "desc" }, take: 10 },
      reconciliations: { orderBy: { createdAt: "desc" }, take: 10, include: { reconciledBy: { select: { name: true } } } },
      discrepancies: { orderBy: { createdAt: "desc" } },
      _count: { select: { transactions: true } },
    },
  });
  const myPhysical = await prisma.ticket.findMany({ where: { kind: "PHYSICAL", inventoryStatus: "ASSIGNED", assignedSellerId: actor.id }, orderBy: { serial: "asc" }, select: { id: true, serial: true, event: { select: { name: true } } } });

  return (
    <>
      <PageHeader title="My cash" subtitle="Cash you reported as collected is your responsibility until a Team Leader counts and confirms it." />
      <div className="space-y-6">
        {accounts.length === 0 && <div className="card text-zinc-500">No cash sales yet.</div>}
        {accounts.map((a) => {
          const outstanding = a.expectedMillimes - a.reconciledMillimes;
          const pending = a.handovers.find((h) => h.status === "SUBMITTED");
          return (
            <Section key={a.id} title={editionTitle(a.event)}>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Expected (sales − reversals)</div><Money m={a.expectedMillimes} className="text-lg font-semibold" /></div>
                <div className="rounded-lg bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Confirmed received by Team Leader</div><Money m={a.reconciledMillimes} className="text-lg font-semibold" /></div>
                <div className="rounded-lg bg-amber-50 p-3"><div className="text-xs text-amber-800">You still owe</div><Money m={outstanding} className="text-lg font-bold" /></div>
              </div>
              <div className="mt-4">
                {pending ? (
                  <div className="flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
                    <span>Handover of <Money m={pending.declaredMillimes} /> declared {fmtDateTime(pending.createdAt)} — awaiting Team Leader count.</span>
                    <ActionButton path={`/team/cash/handovers/${pending.id}/cancel`} label="Withdraw" confirm="Withdraw this handover declaration?" />
                  </div>
                ) : outstanding > 0 && <HandoverForm eventId={a.event.id} suggested={outstanding} />}
              </div>
              {a.discrepancies.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h3 className="font-semibold">Discrepancies</h3>
                  {a.discrepancies.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 p-3 text-sm">
                      <span><Badge>{d.status}</Badge> <Money m={d.amountMillimes} className="font-semibold" /> {d.explanation && <span className="text-zinc-600">— “{d.explanation}”</span>}</span>
                      {d.status !== "RESOLVED" && <ActionButton path={`/team/cash/discrepancies/${d.id}/explain`} label={d.explanation ? "Update explanation" : "Explain"} prompt="Explain this discrepancy" promptKey="explanation" />}
                    </div>
                  ))}
                </div>
              )}
              {a.reconciliations.length > 0 && (
                <table className="table mt-4"><thead><tr><th>Counted</th><th>By</th><th>When</th><th>Outcome</th></tr></thead>
                  <tbody>{a.reconciliations.map((r) => <tr key={r.id}><td><Money m={r.countedMillimes} /></td><td>{r.reconciledBy.name}</td><td>{fmtDateTime(r.createdAt)}</td><td><Badge>{r.outcome}</Badge></td></tr>)}</tbody></table>
              )}
            </Section>
          );
        })}
        {myPhysical.length > 0 && <Section title={`Unsold printed tickets assigned to me (${myPhysical.length})`}><ReturnTickets tickets={myPhysical.map((t) => ({ id: t.id, serial: t.serial, event: t.event.name }))} /></Section>}
      </div>
    </>
  );
}
