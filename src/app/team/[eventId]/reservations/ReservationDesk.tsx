"use client";
import { useState } from "react";
import { Alert, EmailReportList, api, tnd, type EmailReport } from "@/components/client";

interface Res {
  code: string; status: string; expiresAt: string; category: { name: string; priceMillimes: number };
  purchaser: { fullName: string; cin: string }; attendees: { fullName: string; cin: string; admittedAt: string | null; ticketSerial: string | null }[];
}

export function ReservationDesk({ salesPoints }: { salesPoints: { id: string; name: string }[] }) {
  const [code, setCode] = useState(""); const [res, setRes] = useState<Res | null>(null);
  const [cin, setCin] = useState(""); const [cash, setCash] = useState(false); const [sp, setSp] = useState(salesPoints[0]?.id ?? "");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [emails, setEmails] = useState<EmailReport[] | undefined>(); const [busy, setBusy] = useState(false);
  const load = async (c = code) => { setMsg(null); try { setRes(await api("GET", `/team/reservations/${encodeURIComponent(c.trim())}`)); } catch (e) { setRes(null); setMsg({ kind: "error", text: (e as Error).message }); } };
  const toPay = res ? res.attendees.filter((a) => !a.admittedAt).length * res.category.priceMillimes : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <label className="label">Reservation code</label>
        <input className="input num" value={code} onChange={(e) => setCode(e.target.value)} placeholder="R-…" required />
        <button className="btn-secondary w-full">Look up</button>
      </form>
      <div className="space-y-4">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        {msg?.kind === "success" && <EmailReportList emails={emails} />}
        {res && (
          <div className="card space-y-3">
            <div className="flex items-center justify-between"><span className="num text-sm">{res.code}</span><span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{res.status} · UNPAID</span></div>
            <div className="text-sm">Purchaser: <b>{res.purchaser.fullName}</b> ({res.purchaser.cin})</div>
            <ul className="divide-y text-sm">{res.attendees.map((a, i) => <li key={i} className="flex justify-between py-1"><span>{a.fullName} <span className="text-zinc-500">{a.cin}</span></span><span className="text-xs text-zinc-500">{a.ticketSerial ?? (a.admittedAt ? "admitted (unpaid)" : "")}</span></li>)}</ul>
            {res.status === "PENDING" && (
              <form className="space-y-3 border-t pt-3" onSubmit={async (e) => {
                e.preventDefault(); setBusy(true); setMsg(null);
                try {
                  const r = await api("POST", "/team/reservations/convert", { code: res.code, purchaserCin: cin, salesPointId: sp || null, cashCollected: cash, expectedUnitPriceMillimes: res.category.priceMillimes });
                  setMsg({ kind: "success", text: `Converted: ${r.ticketIds.length} paid ticket(s), ${tnd(r.totalMillimes)} added to your cash balance.` }); setEmails(r.emails);
                  setCin(""); setCash(false); await load(res.code);
                } catch (err) { setMsg({ kind: "error", text: (err as Error).message }); }
                finally { setBusy(false); }
              }}>
                <div><label className="label">Purchaser&apos;s CIN (from ID card) to confirm identity</label><input className="input" inputMode="numeric" maxLength={8} value={cin} onChange={(e) => setCin(e.target.value.replace(/\D/g, ""))} required /></div>
                {salesPoints.length > 0 && <div><label className="label">Sales point</label><select className="input" value={sp} onChange={(e) => setSp(e.target.value)}><option value="">— Direct sale —</option>{salesPoints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
                <div className="flex items-baseline justify-between"><span>{res.category.name}</span><span className="text-2xl font-bold">{tnd(toPay)}</span></div>
                <label className="block rounded-lg bg-[var(--accent-soft)] p-3 text-sm text-[var(--accent-ink)]"><input type="checkbox" className="mr-2 align-[-2px]" checked={cash} onChange={(e) => setCash(e.target.checked)} /> I confirm I have physically received {tnd(toPay)} in cash.</label>
                <button className="btn-primary w-full" disabled={busy || !cash}>Convert to paid tickets</button>
                <button type="button" className="btn-secondary w-full" onClick={async () => { const reason = prompt("Reason for cancelling this reservation?"); if (!reason) return; try { await api("POST", `/team/reservations/${encodeURIComponent(res.code)}/cancel`, { reason }); await load(res.code); } catch (e2) { setMsg({ kind: "error", text: (e2 as Error).message }); } }}>Cancel reservation</button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
