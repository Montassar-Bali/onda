"use client";
import { useCallback, useState } from "react";
import { Alert, EmailReportList, PersonFields, QrScanner, api, emptyPerson, extractToken, tnd, type EmailReport, type Person } from "@/components/client";
import { IconArrowRight } from "@/components/icons";

interface Preview { ticketId: string; serial: string; category: string; priceMillimes: number; inventoryStatus: string; assignedToYou: boolean; reason: string | null; event: { name: string } }

export function ActivateFlow() {
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [holder, setHolder] = useState<Person>(emptyPerson());
  const [cash, setCash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ serial: string; totalMillimes: number; warnings: { message: string }[]; emails?: EmailReport[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const onScan = useCallback(async (raw: string) => {
    const t = extractToken(raw);
    setError(null); setDone(null); setCash(false); setHolder(emptyPerson());
    try { setPreview(await api("GET", `/team/physical/preview?token=${encodeURIComponent(t)}`)); setToken(t); }
    catch (e) { setPreview(null); setToken(null); setError((e as Error).message); }
  }, []);

  if (done) return (
    <div className="card space-y-3">
      <Alert kind="success">Ticket {done.serial} activated. {tnd(done.totalMillimes)} added to your cash balance. The buyer also gets a digital copy by email.</Alert>
      <EmailReportList emails={done.emails} />
      {done.warnings.map((w, i) => <Alert key={i} kind="warn">{w.message}</Alert>)}
      <button className="btn-primary w-full" onClick={() => { setDone(null); setPreview(null); setToken(null); }}>Scan next ticket</button>
    </div>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card"><h2 className="mb-3 text-[16px] font-semibold">Scan the printed QR code</h2><QrScanner onScan={onScan} paused={!!preview} /></div>
      <div className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        {preview && (
          <div className="ticket overflow-hidden">
            <div className="flex items-end justify-between gap-4 p-5">
              <div><p className="text-[13px] text-zinc-500">Printed ticket</p><p className="num mt-0.5 font-medium">{preview.serial}</p><p className="text-[13px] text-zinc-600">{preview.category}</p></div>
              <p className="num text-[32px] font-extrabold leading-none tracking-[-0.02em] text-[var(--primary)]">{tnd(preview.priceMillimes)}</p>
            </div>
            {!preview.assignedToYou && <><div className="ticket-perf" /><div className="p-4"><Alert kind="error">Cannot sell: {preview.reason}</Alert></div></>}
          </div>
        )}
        {preview?.assignedToYou && token && (
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault(); setBusy(true); setError(null);
            try { setDone(await api("POST", "/team/physical/activate", { qrToken: token, holder, cashCollected: cash, expectedUnitPriceMillimes: preview.priceMillimes })); }
            catch (err) { setError((err as Error).message); }
            finally { setBusy(false); }
          }}>
            <PersonFields title="Ticket holder" value={holder} onChange={setHolder} />
            <label className="block rounded-md bg-[var(--accent-soft)] p-3 text-[14px] text-[var(--accent-ink)]">
              <input type="checkbox" className="mr-2 align-[-2px]" checked={cash} onChange={(e) => setCash(e.target.checked)} />
              I confirm I have physically received <b>{tnd(preview.priceMillimes)}</b> in cash.
            </label>
            <button className="btn-cta w-full" disabled={busy || !cash}>{busy ? "Activating…" : "Confirm cash & activate"}<span className="cta-arrow"><IconArrowRight size={16} /></span></button>
          </form>
        )}
      </div>
    </div>
  );
}
