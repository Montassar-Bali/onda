import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Money, PageHeader, Section, editionTitle } from "@/components/ui";
import { EventAdminTabs } from "@/components/EventAdminTabs";
import { ApiForm } from "@/components/client";
import { EventFields, toLocal } from "@/components/EventFields";

export const dynamic = "force-dynamic";

export default async function EventSettings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await prisma.event.findUnique({ where: { id }, include: { categories: { orderBy: { priceMillimes: "asc" } }, sellers: true, reservationInventory: true } });
  if (!e) notFound();
  const members = await prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const assigned = new Set(e.sellers.map((s) => s.userId));
  const inv = e.reservationInventory!;
  return (
    <>
      <PageHeader title={editionTitle(e)} subtitle="Settings" back={{ href: "/admin", label: "Events" }} />
      <EventAdminTabs id={id} current="settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Event & capacity"><ApiForm method="PUT" path={`/admin/events/${id}`}><EventFields e={e} /></ApiForm></Section>
        <div className="space-y-6">
          <Section title="Ticket categories (official prices, TND)">
            <table className="table mb-4"><thead><tr><th>Name</th><th>Price</th><th>Cap</th><th>Sold</th></tr></thead>
              <tbody>{e.categories.map((c) => <tr key={c.id}><td>{c.name}</td><td><Money m={c.priceMillimes} /></td><td>{c.capacity ?? "—"}</td><td>{c.soldCount}</td></tr>)}</tbody></table>
            <ApiForm path={`/admin/events/${id}/categories`} submitLabel="Add category" className="grid gap-2 sm:grid-cols-4 sm:items-end" resetOnSuccess successMessage="Category added">
              <div><label className="label">Name</label><input name="name" className="input" required /></div>
              <div><label className="label">Price (TND)</label><input name="price" className="input" placeholder="25.000" inputMode="decimal" required /></div>
              <div><label className="label">Cap (optional)</label><input name="capacity" type="number" min={1} className="input" /></div>
            </ApiForm>
            <p className="mt-2 text-xs text-zinc-500">Prices are locked once a ticket in the category is sold.</p>
          </Section>
          <Section title="Authorized team members">
            <ApiForm method="PUT" path={`/admin/events/${id}/sellers`} submitLabel="Save assignments" className="space-y-2">
              <div className="grid gap-1 sm:grid-cols-2">
                {members.map((m) => <label key={m.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="userIds[]" value={m.id} defaultChecked={assigned.has(m.id)} /> {m.name} <span className="text-xs text-zinc-400">{m.role === "TEAM_LEADER" ? "leader" : ""}</span></label>)}
              </div>
            </ApiForm>
          </Section>
          <Section title="Reservation inventory (separate quota)">
            <ApiForm method="PUT" path={`/admin/events/${id}/reservations`} className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="enabled" defaultChecked={inv.enabled} /> Accept unpaid reservations</label>
              <div><label className="label">Max reserved attendees (quota)</label><input name="maxReservedAttendees" type="number" min={0} className="input" defaultValue={inv.maxReservedAttendees} /></div>
              <div><label className="label">Max tickets per reservation</label><input name="maxTicketsPerReservation" type="number" min={1} className="input" defaultValue={inv.maxTicketsPerReservation} /></div>
              <div><label className="label">Opens</label><input name="opensAt" type="datetime-local" className="input" defaultValue={toLocal(inv.opensAt)} /></div>
              <div><label className="label">Closes</label><input name="closesAt" type="datetime-local" className="input" defaultValue={toLocal(inv.closesAt)} /></div>
              <div><label className="label">Expiration policy</label>
                <select name="expiryPolicy" className="input" defaultValue={inv.expiryPolicy}>
                  <option value="HOURS_AFTER_CREATION">N hours after creation</option><option value="AT_RESERVATION_CLOSE">When reservations close</option><option value="AT_EVENT_START">At event start</option>
                </select></div>
              <div><label className="label">Expiry hours (if N hours)</label><input name="expiryHours" type="number" min={1} className="input" defaultValue={inv.expiryHours ?? ""} /></div>
              <label className="block text-sm sm:col-span-2"><input type="checkbox" className="mr-2 align-[-2px]" name="allowReservationAdmission" defaultChecked={inv.allowReservationAdmission} /> Allow unpaid reservation holders to be admitted at the gate — only when capacity remains after every paid/comp holder.</label>
              <p className="text-xs text-zinc-500 sm:col-span-2">Currently {inv.pendingAttendees} attendee places held by pending reservations. Reservations never consume paid inventory.</p>
            </ApiForm>
          </Section>
        </div>
      </div>
    </>
  );
}
