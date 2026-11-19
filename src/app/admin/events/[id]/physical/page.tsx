import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Badge, PageHeader, Section, fmtDateTime, editionTitle } from "@/components/ui";
import { EventAdminTabs } from "@/components/EventAdminTabs";
import { ApiForm } from "@/components/client";
import { TicketBulkTable } from "./TicketBulkTable";

export const dynamic = "force-dynamic";

export default async function PhysicalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ batch?: string; status?: string }> }) {
  const { id } = await params; const sp = await searchParams;
  const e = await prisma.event.findUnique({ where: { id }, include: { categories: true, sellers: { include: { user: true } } } });
  if (!e) notFound();
  const [batches, salesPoints] = await Promise.all([
    prisma.physicalTicketBatch.findMany({ where: { eventId: id }, orderBy: { number: "desc" }, include: { category: true, createdBy: { select: { name: true } } } }),
    prisma.salesPoint.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const counts = await prisma.ticket.groupBy({ by: ["batchId", "inventoryStatus"], where: { eventId: id, kind: "PHYSICAL" }, _count: true });
  const statusFilter = sp.status && ["AVAILABLE", "ASSIGNED", "SOLD", "VOID", "RETURNED"].includes(sp.status) ? sp.status : undefined;
  const tickets = await prisma.ticket.findMany({
    where: { eventId: id, kind: "PHYSICAL", ...(sp.batch ? { batchId: sp.batch } : {}), ...(statusFilter ? { inventoryStatus: statusFilter as never } : {}) },
    orderBy: { serial: "asc" }, take: 500,
    include: { assignedSeller: { select: { name: true } }, assignedSalesPoint: { select: { name: true } }, soldBy: { select: { name: true } } },
  });
  const sellers = e.sellers.map((s) => ({ id: s.user.id, name: s.user.name }));
  return (
    <>
      <PageHeader title={editionTitle(e)} subtitle="Pre-printed physical tickets — invalid until sold & activated by an authorized seller" back={{ href: "/admin", label: "Events" }} />
      <EventAdminTabs id={id} current="physical" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Generate a batch">
          <ApiForm path="/admin/batches" submitLabel="Generate batch" extra={{ eventId: id }} successMessage="Batch generated">
            <div><label className="label">Category</label><select name="categoryId" className="input">{e.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="label">Quantity (max 200)</label><input name="quantity" type="number" min={1} max={200} defaultValue={50} className="input" required /></div>
            <div><label className="label">Assign to seller (optional)</label><select name="sellerId" className="input"><option value="">—</option>{sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label className="label">…or to sales point</label><select name="salesPointId" className="input"><option value="">—</option>{salesPoints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          </ApiForm>
        </Section>
        <div className="lg:col-span-2">
          <Section title="Batches">
            <table className="table">
              <thead><tr><th>#</th><th>Category</th><th>Qty</th><th>Status mix</th><th>Created</th><th>Printed</th><th></th></tr></thead>
              <tbody>{batches.map((b) => (
                <tr key={b.id}>
                  <td><a className="text-brand-700 hover:underline" href={`?batch=${b.id}`}>B{String(b.number).padStart(3, "0")}</a></td>
                  <td>{b.category.name}</td><td>{b.quantity}</td>
                  <td className="space-x-1">{counts.filter((c) => c.batchId === b.id).map((c) => <span key={c.inventoryStatus} className="text-xs">{c.inventoryStatus.toLowerCase()} {c._count}</span>)}</td>
                  <td className="text-xs">{fmtDateTime(b.createdAt)}<br />{b.createdBy.name}</td>
                  <td className="text-xs">{b.printedAt ? `${fmtDateTime(b.printedAt)} (×${b.printCount})` : "—"}</td>
                  <td><a className="btn-secondary text-xs" href={`/api/admin/batches/${b.id}/pdf`} target="_blank">Print PDF</a></td>
                </tr>
              ))}</tbody>
            </table>
          </Section>
        </div>
      </div>
      <div className="mt-6">
        <Section title={`Tickets${sp.batch ? " in batch" : ""} (${tickets.length}${tickets.length === 500 ? "+" : ""})`} aside={
          <div className="flex gap-1 text-xs">{["", "AVAILABLE", "ASSIGNED", "SOLD", "RETURNED", "VOID"].map((s) => <a key={s} href={`?${new URLSearchParams({ ...(sp.batch ? { batch: sp.batch } : {}), ...(s ? { status: s } : {}) })}`} className={`rounded px-2 py-1 ${statusFilter === s || (!statusFilter && !s) ? "bg-zinc-800 text-white" : "bg-zinc-100"}`}>{s || "All"}</a>)}</div>
        }>
          <TicketBulkTable sellers={sellers} salesPoints={salesPoints.map((s) => ({ id: s.id, name: s.name }))}
            tickets={tickets.map((t) => ({ id: t.id, serial: t.serial, inventoryStatus: t.inventoryStatus, paymentStatus: t.paymentStatus, admissionStatus: t.admissionStatus, holder: t.assignedSeller?.name ?? t.assignedSalesPoint?.name ?? null, soldBy: t.soldBy?.name ?? null }))} />
        </Section>
      </div>
      <p className="mt-2 text-xs text-zinc-500"><Badge>NOT_ELIGIBLE</Badge> tickets scan as “UNSOLD TICKET — PAYMENT NOT RECORDED — ENTRY DENIED”.</p>
    </>
  );
}
