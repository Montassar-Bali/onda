"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, api } from "@/components/client";

export function CancelReservation({ code }: { code: string }) {
  const router = useRouter();
  const [cin, setCin] = useState(""); const [error, setError] = useState<string | null>(null); const [open, setOpen] = useState(false);
  if (!open) return <button className="btn-secondary" onClick={() => setOpen(true)}>Cancel reservation</button>;
  return (
    <form className="space-y-2 rounded-lg border border-zinc-200 p-3" onSubmit={async (e) => {
      e.preventDefault(); setError(null);
      try { await api("POST", `/public/reservations/${encodeURIComponent(code)}/cancel`, { purchaserCin: cin }); router.refresh(); }
      catch (err) { setError((err as Error).message); }
    }}>
      {error && <Alert kind="error">{error}</Alert>}
      <label className="label">Confirm with the national ID (CIN) of the person who reserved</label>
      <input className="input" inputMode="numeric" maxLength={8} value={cin} onChange={(e) => setCin(e.target.value.replace(/\D/g, ""))} required />
      <button className="btn-danger">Confirm cancellation</button>
    </form>
  );
}
