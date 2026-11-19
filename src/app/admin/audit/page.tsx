import { prisma } from "@/lib/db";
import { PageHeader, Section, fmtDateTime } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const [logs, access] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { actor: { select: { name: true } } } }),
    prisma.identityAccessLog.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { accessedBy: { select: { name: true } }, identity: { select: { fullName: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Append-only. Rows cannot be modified or deleted (database trigger)." />
      <div className="space-y-6">
        <Section title="Sensitive identity access">
          <table className="table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Identity</th><th>Reason</th></tr></thead>
            <tbody>{access.map((a) => <tr key={a.id}><td className="text-xs">{fmtDateTime(a.createdAt)}</td><td>{a.accessedBy.name}</td><td className="text-xs">{a.action}</td><td>{a.identity?.fullName ?? "—"}</td><td className="text-xs">{a.reason}</td></tr>)}</tbody></table>
        </Section>
        <Section title="Recent activity">
          <div className="overflow-x-auto"><table className="table"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>{logs.map((l) => <tr key={l.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(l.createdAt)}</td><td className="text-xs">{l.actor?.name ?? "system / public"}</td><td className="text-xs font-medium">{l.action}</td><td className="text-xs">{l.entityType}</td><td className="max-w-md truncate font-mono text-[11px] text-zinc-500">{l.data ? JSON.stringify(l.data) : ""}</td></tr>)}</tbody></table></div>
        </Section>
      </div>
    </>
  );
}
