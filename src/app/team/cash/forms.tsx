"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, api, tnd } from "@/components/client";

export function HandoverForm({ eventId, suggested }: { eventId: string; suggested: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState((suggested / 1000).toFixed(3)); const [note, setNote] = useState(""); const [err, setErr] = useState<string | null>(null);
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await api("POST", "/team/cash/handovers", { eventId, amount, note }); router.refresh(); } catch (e2) { setErr((e2 as Error).message); } }}>
      <div><label className="label">Cash I am handing over (TND)</label><input className="input w-40" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
      <div className="flex-1"><label className="label">Note (optional)</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <button className="btn-primary">Declare handover</button>
      <p className="w-full text-xs text-zinc-500">Outstanding: {tnd(suggested)}. Your balance only changes when a Team Leader counts the cash.</p>
      {err && <div className="w-full"><Alert kind="error">{err}</Alert></div>}
    </form>
  );
}

export function ReturnTickets({ tickets }: { tickets: { id: string; serial: string; event: string }[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);
  return (
    <div className="space-y-3">
      <div className="grid max-h-64 gap-1 overflow-y-auto text-sm sm:grid-cols-3">
        {tickets.map((t) => <label key={t.id} className="flex items-center gap-2"><input type="checkbox" checked={sel.includes(t.id)} onChange={(e) => setSel(e.target.checked ? [...sel, t.id] : sel.filter((x) => x !== t.id))} /> <span className="num">{t.serial}</span></label>)}
      </div>
      <button className="btn-secondary" disabled={!sel.length} onClick={async () => { if (!confirm(`Return ${sel.length} unsold ticket(s) to central inventory?`)) return; try { await api("POST", "/team/physical/return", { ticketIds: sel }); setSel([]); router.refresh(); } catch (e) { alert((e as Error).message); } }}>Return {sel.length || ""} selected</button>
    </div>
  );
}
