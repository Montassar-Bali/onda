import { notFound } from "next/navigation";
import { accountHistory, reconstructAccount } from "@/services/cash";
import { Badge, Money, PageHeader, Section, fmtDateTime, editionTitle } from "@/components/ui";
import { Alert } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function AccountHistory({ params }: { params: Promise<{ id: string; accountId: string }> }) {
  const { id, accountId } = await params;
  const a = await accountHistory(accountId);
  if (!a || a.eventId !== id) notFound();
  const check = await reconstructAccount(accountId);
  return (
    <>
      <PageHeader title={`${a.seller.name} — ${editionTitle(a.event)}`} subtitle="Seller cash account: full history" back={{ href: `/admin/events/${id}/cash`, label: "Cash reconciliation" }} />
      <div className="mb-4">{check.consistent
        ? <Alert kind="success">Independent reconstruction from the ledger matches: expected <Money m={check.expectedMillimes} />, reconciled <Money m={check.reconciledMillimes} />, outstanding <Money m={check.outstandingMillimes} />.</Alert>
        : <Alert kind="error">Ledger reconstruction does NOT match cached totals — investigate immediately.</Alert>}</div>
      <div className="space-y-6">
        <Section title={`Cash ledger (${a.transactions.length})`}>
          <div className="max-h-96 overflow-auto"><table className="table"><thead><tr><th>When</th><th>Type</th><th>Ticket</th><th>Sales point</th><th>Amount</th><th>Reason</th></tr></thead>
            <tbody>{a.transactions.map((t) => <tr key={t.id}><td className="text-xs">{fmtDateTime(t.createdAt)}</td><td><Badge tone={t.type === "SALE" ? "green" : "red"}>{t.type}</Badge></td><td className="num text-xs">{t.ticket.serial}</td><td className="text-xs">{t.salesPoint?.name ?? "—"}</td><td><Money m={t.amountMillimes} /></td><td className="text-xs">{t.reason ?? ""}</td></tr>)}</tbody></table></div>
        </Section>
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Handover declarations">
            <table className="table"><thead><tr><th>When</th><th>Declared</th><th>Status</th></tr></thead>
              <tbody>{a.handovers.map((h) => <tr key={h.id}><td className="text-xs">{fmtDateTime(h.createdAt)}</td><td><Money m={h.declaredMillimes} /></td><td><Badge>{h.status}</Badge></td></tr>)}</tbody></table>
          </Section>
          <Section title="Reconciliations (cash counted by Team Leader)">
            <table className="table"><thead><tr><th>When</th><th>By</th><th>Counted</th><th>Declared</th><th>Outstanding before</th><th>Outcome</th></tr></thead>
              <tbody>{a.reconciliations.map((r) => <tr key={r.id}><td className="text-xs">{fmtDateTime(r.createdAt)}</td><td className="text-xs">{r.reconciledBy.name}</td><td><Money m={r.countedMillimes} /></td><td>{r.declaredMillimes != null ? <Money m={r.declaredMillimes} /> : "—"}</td><td><Money m={r.outstandingBeforeMillimes} /></td><td><Badge>{r.outcome}</Badge>{r.isFinal && <span className="ml-1 text-xs">final</span>}</td></tr>)}</tbody></table>
          </Section>
        </div>
      </div>
    </>
  );
}
