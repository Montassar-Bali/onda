import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { maskCin } from "@/lib/cin";
import { Money, PageHeader, Section, fmtDateTime, editionTitle } from "@/components/ui";
import { EventAdminTabs } from "@/components/EventAdminTabs";
import { ActionButton } from "@/components/client";
import { CompForm, ReissueButton, ResendEmailButton } from "./forms";

export const dynamic = "force-dynamic";

export default async function TicketsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params; const { q } = await searchParams;
  const e = await prisma.event.findUnique({ where: { id }, include: { categories: true } });
  if (!e) notFound();
  const tickets = await prisma.ticket.findMany({
    where: { eventId: id, holderIdentityId: { not: null }, ...(q ? { OR: [{ serial: { contains: q.trim(), mode: "insensitive" } }, { holder: { fullName: { contains: q.trim(), mode: "insensitive" } } }] } : {}) },
    orderBy: { createdAt: "desc" }, take: 100,
    include: { holder: { select: { fullName: true, cinLast3: true } }, category: { select: { name: true } }, soldBy: { select: { name: true } }, issuedBy: { select: { name: true } } },
  });
  const pill = (s: string) => <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium">{s.replaceAll("_", " ").toLowerCase()}</span>;
  return (
    <>
      <PageHeader title={editionTitle(e)} subtitle="Issued tickets, complimentary tickets, reversals and reissues" back={{ href: "/admin", label: "Events" }} />
      <EventAdminTabs id={id} current="tickets" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title={`Complimentary (${e.compIssuedCount}/${e.complimentaryAllocation})`}>
          <CompForm eventId={id} categories={e.categories.map((c) => ({ id: c.id, name: c.name }))} />
        </Section>
        <div className="lg:col-span-2">
          <Section title="Tickets" aside={<form><input name="q" defaultValue={q} placeholder="Serial or holder name" className="input py-1 text-sm" /></form>}>
            <div className="overflow-x-auto"><table className="table">
              <thead><tr><th>Serial</th><th>Holder</th><th>Category</th><th>Price</th><th>Status (inv / pay / adm)</th><th>By</th><th></th></tr></thead>
              <tbody>{tickets.map((t) => (
                <tr key={t.id}>
                  <td className="num text-xs">{t.serial}<div className="text-zinc-400">{t.kind.toLowerCase()}</div></td>
                  <td>{t.holder?.fullName}<div className="text-xs text-zinc-500">{maskCin(t.holder?.cinLast3)}</div></td>
                  <td className="text-xs">{t.category.name}</td>
                  <td>{t.kind === "COMPLIMENTARY" ? <span className="text-xs">comp</span> : <Money m={t.priceMillimes ?? 0} />}</td>
                  <td className="space-x-1">{pill(t.inventoryStatus)}{pill(t.paymentStatus)}{pill(t.admissionStatus)}</td>
                  <td className="text-xs">{t.soldBy?.name ?? t.issuedBy?.name}<div className="text-zinc-400">{t.soldAt ? fmtDateTime(t.soldAt) : ""}</div>{t.complimentaryReason && <div className="text-zinc-500">“{t.complimentaryReason}”</div>}</td>
                  <td className="space-y-1 whitespace-nowrap text-xs">
                    {t.admissionStatus === "VALID" && t.paymentStatus === "CASH_REPORTED_COLLECTED" && <ActionButton path={`/admin/tickets/${t.id}/reverse`} label="Reverse sale" className="btn-secondary py-1 text-xs" prompt="Reason for cash reversal (refund)" confirm="Reverse this sale? The ticket is revoked and the seller's liability reduced." />}
                    {t.admissionStatus === "VALID" && t.kind === "COMPLIMENTARY" && <ActionButton path={`/admin/tickets/${t.id}/revoke`} label="Revoke" className="btn-secondary py-1 text-xs" prompt="Reason for revoking" />}
                    {(t.admissionStatus === "VALID" || t.admissionStatus === "CHECKED_IN") && <ResendEmailButton ticketId={t.id} />}
                    {t.admissionStatus === "VALID" && <ReissueButton ticketId={t.id} />}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          </Section>
        </div>
      </div>
    </>
  );
}
