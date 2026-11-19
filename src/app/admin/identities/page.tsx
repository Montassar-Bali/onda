"use client";
import { useState } from "react";
import { Alert, api } from "@/components/client";

interface Found { id: string; fullName: string; phone: string; email: string; cin: string }

export default function IdentitiesPage() {
  const [cin, setCin] = useState(""); const [reason, setReason] = useState("");
  const [found, setFound] = useState<Found | null | undefined>(undefined); const [full, setFull] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Identity lookup</h1>
      <Alert kind="warn">National IDs are sensitive personal data. Every lookup and every full-CIN view is permanently logged with your name and reason.</Alert>
      <form className="card space-y-3" onSubmit={async (e) => { e.preventDefault(); setErr(null); setFull(null); try { setFound(await api("POST", "/admin/identities/lookup", { cin, reason })); } catch (e2) { setErr((e2 as Error).message); } }}>
        <div><label className="label">CIN</label><input className="input" inputMode="numeric" maxLength={8} value={cin} onChange={(e) => setCin(e.target.value.replace(/\D/g, ""))} required /></div>
        <div><label className="label">Reason for access *</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} placeholder="e.g. Verify ticket dispute #12" /></div>
        <button className="btn-primary">Look up</button>
      </form>
      {err && <Alert kind="error">{err}</Alert>}
      {found === null && <Alert kind="info">No identity record for this CIN.</Alert>}
      {found && (
        <div className="card space-y-2 text-sm">
          <div className="text-lg font-semibold">{found.fullName}</div>
          <div>CIN: <span className="num">{full ?? found.cin}</span></div>
          <div>Phone: {found.phone}</div><div>Email: {found.email}</div>
          {!full && <button className="btn-secondary" onClick={async () => { try { setFull((await api("POST", `/admin/identities/${found.id}/reveal`, { reason })).cin); } catch (e) { setErr((e as Error).message); } }}>Reveal full CIN (logged)</button>}
        </div>
      )}
    </div>
  );
}
