"use client";
import { useCallback, useState } from "react";
import { Alert, QrScanner, api, extractToken } from "@/components/client";
import { IconCheck, IconX } from "@/components/icons";

interface ScanResponse { result: string; admitted: boolean; message: string; ticket?: { serial: string; category: string; kind: string; holderName: string | null } }

const kindWord: Record<string, string> = { DIGITAL: "Digital ticket", PHYSICAL: "Printed ticket", COMPLIMENTARY: "Complimentary" };

export function ScanStation({ eventId, allowReservations }: { eventId: string; allowReservations: boolean }) {
  const [res, setRes] = useState<ScanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"ticket" | "reservation">("ticket");
  const [code, setCode] = useState(""); const [cin, setCin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const onScan = useCallback(async (raw: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await api<ScanResponse>("POST", "/team/checkin", { eventId, qrToken: extractToken(raw) });
      setRes(r); if (r.admitted) setCount((c) => c + 1);
      navigator.vibrate?.(r.admitted ? 80 : [60, 60, 60]);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }, [eventId]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* the verdict comes first on a phone: it is what the gate is for */}
      <div className={res ? "order-first lg:order-last" : "order-last"}>
        {err && <div className="mb-4"><Alert kind="error">{err}</Alert></div>}
        {res ? (
          <div aria-live="assertive" className={`rounded-[28px] px-6 py-8 text-white transition-colors pop ${res.admitted ? "bg-[#14a06b] shadow-[0_18px_40px_rgba(20,160,107,0.35)]" : "bg-[#e5484d] shadow-[0_18px_40px_rgba(229,72,77,0.35)]"}`}>
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/15">{res.admitted ? <IconCheck size={32} /> : <IconX size={32} />}</span>
              <span className="text-[32px] font-bold leading-none tracking-[-0.02em] sm:text-[40px]">{res.admitted ? "Admit" : "Deny"}</span>
            </div>
            <p className="mt-5 text-[17px] font-semibold leading-snug">{res.message}</p>
            {res.ticket && (
              <dl className="mt-5 grid grid-cols-2 gap-y-2 border-t border-white/20 pt-4 text-[14px]">
                <dt className="text-white/75">Holder</dt><dd className="text-right font-medium">{res.ticket.holderName ?? "None (unsold)"}</dd>
                <dt className="text-white/75">Ticket</dt><dd className="text-right">{kindWord[res.ticket.kind] ?? res.ticket.kind} · {res.ticket.category}</dd>
                <dt className="text-white/75">Number</dt><dd className="num text-right">{res.ticket.serial}</dd>
              </dl>
            )}
            {res.ticket?.holderName && res.admitted && <p className="mt-4 text-[13px] text-white/80">Check the holder&apos;s ID card if in doubt.</p>}
          </div>
        ) : (
          <div className="hidden min-h-[220px] place-items-center rounded-[28px] border-2 border-dashed lg:grid border-[var(--primary-track)] bg-[var(--surface)] px-6 text-center text-zinc-500">
            <div><p className="text-[16px] font-medium text-zinc-800">Ready to scan</p><p className="mt-1 text-[14px]">The verdict appears here, in green or red.</p></div>
          </div>
        )}
        <p className="mt-3 text-[13px] text-zinc-500">Admitted on this device this session: <span className="num font-medium text-zinc-900">{count}</span></p>
      </div>

      <div className="card">
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-[var(--track)] p-1.5 text-[14px]" role="tablist">
          {(["ticket", "reservation"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`h-11 rounded-full font-bold transition-all ${tab === t ? "bg-[var(--surface)] text-[var(--primary)] shadow-[0_4px_14px_rgba(40,10,15,0.14)]" : "text-zinc-500"}`}>
              {t === "ticket" ? "Ticket QR" : "Unpaid reservation"}
            </button>
          ))}
        </div>
        {tab === "ticket" ? <QrScanner onScan={onScan} paused={busy} /> : !allowReservations ? (
          <Alert kind="info">This event does not admit unpaid reservations. Send the holder to a seller to buy a ticket.</Alert>
        ) : (
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault(); setErr(null); setBusy(true);
            try { setRes(await api("POST", "/team/reservations/admit", { eventId, code: code.trim(), attendeeCin: cin })); setCin(""); }
            catch (e2) { setErr((e2 as Error).message); }
            finally { setBusy(false); }
          }}>
            <p className="text-[14px] text-zinc-600">Admitted only if places remain after every paid ticket holder. Check the ID card itself.</p>
            <div><label className="label" htmlFor="rcode">Reservation code</label><input id="rcode" className="input" value={code} onChange={(e) => setCode(e.target.value)} required /></div>
            <div><label className="label" htmlFor="rcin">National ID (CIN) of the attendee</label><input id="rcin" className="input tracking-[0.2em]" inputMode="numeric" maxLength={8} value={cin} onChange={(e) => setCin(e.target.value.replace(/\D/g, ""))} required /></div>
            <button className="btn-cta w-full" disabled={busy}>Check admission</button>
          </form>
        )}
      </div>
    </div>
  );
}
