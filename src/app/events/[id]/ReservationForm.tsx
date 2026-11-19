"use client";
import { useState } from "react";
import { Alert, PersonFields, api, emptyPerson, tnd, type Person } from "@/components/client";
import { IconArrowRight } from "@/components/icons";

export function ReservationForm({ eventId, categories, maxAttendees }: { eventId: string; categories: { id: string; name: string; priceMillimes: number }[]; maxAttendees: number }) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [purchaser, setPurchaser] = useState<Person>(emptyPerson());
  const [purchaserAttends, setPurchaserAttends] = useState(true);
  const [others, setOthers] = useState<Person[]>([]);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const total = (purchaserAttends ? 1 : 0) + others.length;

  if (done) return (
    <div className="card space-y-3 p-7">
      <Alert kind="success">Reservation recorded. Confirmation sent by email.</Alert>
      <p>Your reservation code: <b className="num">{done.code}</b></p>
      <p className="text-sm text-zinc-600">Expires {new Date(done.expiresAt).toLocaleString("fr-TN")}. This is <b>not</b> a paid ticket.</p>
      <a className="btn-secondary" href={`/reservations/${encodeURIComponent(done.code)}`}>View reservation</a>
    </div>
  );

  return (
    <form className="card space-y-5 p-5 sm:p-7" onSubmit={async (e) => {
      e.preventDefault(); setError(null);
      const attendees = [...(purchaserAttends ? [purchaser] : []), ...others];
      if (attendees.length === 0) return setError("Add at least one attendee");
      setBusy(true);
      try { setDone(await api("POST", "/public/reservations", { eventId, categoryId, purchaser, attendees, acknowledgeNotATicket: ack })); }
      catch (err) { setError((err as Error).message); }
      finally { setBusy(false); }
    }}>
      <div>
        <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">Reserve for free</h2>
        <p className="mt-2 text-[15px] leading-6 text-zinc-700">A reservation is not a ticket and does not guarantee entry. Paid ticket holders come first. Pay in cash before it expires to get your tickets.</p>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <div><label className="label">Category</label>
        <select className="input font-semibold" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name} — {tnd(c.priceMillimes)} (to pay in cash)</option>)}</select>
      </div>
      <PersonFields flat title="Your details" value={purchaser} onChange={setPurchaser} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={purchaserAttends} onChange={(e) => setPurchaserAttends(e.target.checked)} /> I will attend too</label>
      {others.map((p, i) => (
        <div key={i} className="relative">
          <PersonFields flat title={`Attendee ${i + (purchaserAttends ? 2 : 1)}`} value={p} onChange={(np) => setOthers(others.map((o, j) => (j === i ? np : o)))} />
          <button type="button" className="absolute right-3 top-0 text-sm text-red-600" onClick={() => setOthers(others.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      {total < maxAttendees && <button type="button" className="btn-secondary" onClick={() => setOthers([...others, emptyPerson()])}>Add an attendee</button>}
      <label className="block rounded-2xl bg-[var(--warn-bg)] p-4 text-[14px] leading-5 text-[var(--warn-ink)]">
        <input type="checkbox" className="mr-2 align-[-2px]" checked={ack} onChange={(e) => setAck(e.target.checked)} required />
        I understand this reservation is unpaid, is not a ticket, does not guarantee admission, and that paid ticket holders have priority.
      </label>
      <button className="btn-cta w-full" disabled={busy || !ack || total === 0}>{busy ? "Submitting…" : `Reserve for ${total}`}<span className="cta-arrow"><IconArrowRight size={16} /></span></button>
      <p className="text-[13px] text-zinc-500">Each attendee needs their own national ID. It is encrypted and never shown publicly.</p>
    </form>
  );
}
