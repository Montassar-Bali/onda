"use client";
import { useState } from "react";
import { Alert, EmailReportList, PersonFields, api, emptyPerson, tnd, type EmailReport, type Person } from "@/components/client";
import { IconArrowRight } from "@/components/icons";

interface Cat { id: string; name: string; priceMillimes: number }

export function SellForm({ eventId, categories, salesPoints, remaining, maxPerSale }: { eventId: string; categories: Cat[]; salesPoints: { id: string; name: string }[]; remaining: number; maxPerSale: number }) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [holders, setHolders] = useState<Person[]>([emptyPerson()]);
  const [separatePurchaser, setSeparatePurchaser] = useState(false);
  const [purchaser, setPurchaser] = useState<Person>(emptyPerson());
  const [salesPointId, setSalesPointId] = useState(salesPoints[0]?.id ?? "");
  const [cash, setCash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ticketIds: string[]; totalMillimes: number; warnings: { message: string }[]; emails?: EmailReport[] } | null>(null);
  const cat = categories.find((c) => c.id === categoryId);
  const total = (cat?.priceMillimes ?? 0) * holders.length;

  const reset = () => { setHolders([emptyPerson()]); setPurchaser(emptyPerson()); setSeparatePurchaser(false); setCash(false); setResult(null); setError(null); };

  if (result) return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="ticket overflow-hidden">
        <div className="hero px-6 py-7">
          <p className="text-[14px] font-semibold text-white/85">Sale recorded ✓</p>
          <p className="num mt-1 text-[32px] font-bold tracking-[-0.02em]">{tnd(result.totalMillimes)}</p>
          <p className="mt-1 text-[14px] text-white/85">{result.ticketIds.length} ticket{result.ticketIds.length > 1 ? "s" : ""} issued. The buyer gets every ticket by email; each attendee gets their own.</p>
        </div>
        <div className="ticket-perf" />
        <div className="px-6 py-4 text-[14px] text-zinc-600">This amount is now in your cash balance until a Team Leader counts it.</div>
      </div>
      <EmailReportList emails={result.emails} />
      {result.warnings.map((w, i) => <Alert key={i} kind="warn">{w.message}</Alert>)}
      <button className="btn-cta w-full" onClick={reset}>Next sale<span className="cta-arrow"><IconArrowRight size={16} /></span></button>
    </div>
  );

  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault(); setError(null);
      if (!cat) return;
      setBusy(true);
      try {
        setResult(await api("POST", "/team/sales", {
          eventId, categoryId, holders, purchaser: separatePurchaser ? purchaser : null, salesPointId: salesPointId || null,
          cashCollected: cash, expectedUnitPriceMillimes: cat.priceMillimes,
        }));
      } catch (err) { setError((err as Error).message); }
      finally { setBusy(false); }
    }}>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="card grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <span className="label">Ticket category</span>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Ticket category">
            {categories.map((c) => (
              <button type="button" key={c.id} role="radio" aria-checked={categoryId === c.id} onClick={() => setCategoryId(c.id)}
                className={`flex min-h-16 items-center justify-between rounded-2xl border-2 px-5 text-left transition-all ${categoryId === c.id ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-ink)]" : "border-[var(--control)] bg-[var(--surface)] hover:border-[var(--primary-track)]"}`}>
                <span className="text-[16px] font-bold">{c.name}</span><span className="num text-[16px] font-extrabold">{tnd(c.priceMillimes)}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[13px] text-zinc-500">Official prices, fixed by the Team Leader. {remaining} paid tickets left.</p>
        </div>
        <div className="sm:col-span-2"><label className="label">Sales point</label>
          <select className="input" value={salesPointId} onChange={(e) => setSalesPointId(e.target.value)}>
            <option value="">— Direct sale (no sales point) —</option>
            {salesPoints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {holders.map((h, i) => (
        <div key={i} className="relative">
          <PersonFields title={`Ticket holder ${i + 1}`} value={h} onChange={(p) => setHolders(holders.map((x, j) => (j === i ? p : x)))} />
          {holders.length > 1 && <button type="button" className="absolute right-3 top-0 text-sm text-red-600" onClick={() => setHolders(holders.filter((_, j) => j !== i))}>Remove</button>}
        </div>
      ))}
      {holders.length < maxPerSale && <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => setHolders([...holders, emptyPerson()])}>Add another attendee</button>}

      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={separatePurchaser} onChange={(e) => setSeparatePurchaser(e.target.checked)} /> The person paying is not one of the ticket holders</label>
      {separatePurchaser && <PersonFields title="Purchaser" value={purchaser} onChange={setPurchaser} />}

      <div className="ticket overflow-hidden">
        <div className="flex items-end justify-between gap-4 px-5 pb-4 pt-5">
          <div><p className="text-[14px] text-zinc-600">Collect in cash</p><p className="text-[13px] text-zinc-500">{holders.length} × {cat ? tnd(cat.priceMillimes) : "—"}</p></div>
          <p className="num text-[32px] font-extrabold leading-none tracking-[-0.02em] text-[var(--primary)]">{tnd(total)}</p>
        </div>
        <div className="ticket-perf" />
        <div className="space-y-3 p-5">
        <label className="block rounded-md bg-[var(--accent-soft)] p-3 text-[14px] leading-5 text-[var(--accent-ink)]">
          <input type="checkbox" className="mr-2 align-[-2px]" checked={cash} onChange={(e) => setCash(e.target.checked)} />
          I confirm I have physically received <b>{tnd(total)}</b> in cash. This amount becomes my responsibility until handed over to the Team Leader.
        </label>
        <button className="btn-cta w-full" disabled={busy || !cash}>{busy ? "Recording…" : "Confirm cash sale"}<span className="cta-arrow"><IconArrowRight size={16} /></span></button>
        </div>
      </div>
    </form>
  );
}
