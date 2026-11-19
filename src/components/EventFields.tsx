const toLocal = (d?: Date | string | null) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export function EventFields({ e }: { e?: { name: string; theme?: string | null; themeColor?: string | null; description: string | null; venue: string; startsAt: Date; endsAt: Date; venueCapacity: number; paidTicketCapacity: number; complimentaryAllocation: number; maxTicketsPerIdentity: number } }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><label className="label">Name</label><input name="name" className="input" defaultValue={e?.name} required /></div>
      <div className="sm:col-span-2"><label className="label">This edition&apos;s theme (shown on posters and tickets)</label><input name="theme" className="input" maxLength={80} defaultValue={e?.theme ?? ""} placeholder="e.g. Brazilian Night" /></div>
      <div className="sm:col-span-2"><label className="label">Theme colour</label><div className="flex items-center gap-3"><input name="themeColor" type="color" className="h-[52px] w-16 cursor-pointer rounded-xl border border-[var(--control)] bg-[var(--surface)] p-1" defaultValue={e?.themeColor ?? "#e1102a"} /><span className="text-[13px] text-zinc-500">Tints this edition&apos;s poster and ticket. The site stays ONDA red.</span></div></div>
      <div className="sm:col-span-2"><label className="label">Description</label><textarea name="description" className="input" rows={3} defaultValue={e?.description ?? ""} /></div>
      <div className="sm:col-span-2"><label className="label">Venue</label><input name="venue" className="input" defaultValue={e?.venue ?? "Tropical Bar"} required /></div>
      <div><label className="label">Starts</label><input name="startsAt" type="datetime-local" className="input" defaultValue={toLocal(e?.startsAt)} required /></div>
      <div><label className="label">Ends</label><input name="endsAt" type="datetime-local" className="input" defaultValue={toLocal(e?.endsAt)} required /></div>
      <div><label className="label">Venue capacity (hard admission limit)</label><input name="venueCapacity" type="number" min={1} className="input" defaultValue={e?.venueCapacity ?? 500} required /></div>
      <div><label className="label">Paid ticket inventory</label><input name="paidTicketCapacity" type="number" min={0} className="input" defaultValue={e?.paidTicketCapacity ?? 400} required /></div>
      <div><label className="label">Complimentary allocation</label><input name="complimentaryAllocation" type="number" min={0} className="input" defaultValue={e?.complimentaryAllocation ?? 20} required /></div>
      <div><label className="label">Max tickets per national ID</label><input name="maxTicketsPerIdentity" type="number" min={1} className="input" defaultValue={e?.maxTicketsPerIdentity ?? 4} required /></div>
      <p className="text-xs text-zinc-500 sm:col-span-2">Paid inventory + complimentary allocation must not exceed venue capacity. Reservations have their own separate quota (Settings).</p>
    </div>
  );
}
export { toLocal };
