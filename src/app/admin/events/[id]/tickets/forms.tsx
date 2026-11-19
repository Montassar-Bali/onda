"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, EmailReportList, PersonFields, api, emailSummary, emptyPerson, type EmailReport } from "@/components/client";

export function CompForm({ eventId, categories }: { eventId: string; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [holder, setHolder] = useState(emptyPerson()); const [categoryId, setCategoryId] = useState(categories[0]?.id ?? ""); const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ k: "error" | "success" | "warn"; t: string }[]>([]);
  const [emails, setEmails] = useState<EmailReport[] | undefined>();
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setMsg([]);
      try {
        const r = await api("POST", "/admin/complimentary", { eventId, categoryId, holder, reason });
        setMsg([{ k: "success", t: "Complimentary ticket issued." }, ...r.warnings.map((w: { message: string }) => ({ k: "warn" as const, t: w.message }))]); setEmails(r.emails);
        setHolder(emptyPerson()); setReason(""); router.refresh();
      } catch (err) { setMsg([{ k: "error", t: (err as Error).message }]); }
    }}>
      <div><label className="label">Category</label><select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <PersonFields title="Holder" value={holder} onChange={setHolder} />
      <div><label className="label">Documented reason *</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} placeholder="e.g. Press — La Presse" /></div>
      {msg.map((m, i) => <Alert key={i} kind={m.k}>{m.t}</Alert>)}
      {msg[0]?.k === "success" && <EmailReportList emails={emails} />}
      <button className="btn-primary w-full">Issue complimentary ticket</button>
    </form>
  );
}

export function ReissueButton({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  return <button className="btn-secondary block py-1 text-xs" onClick={async () => {
    const cin = prompt("Holder's CIN from their ID card (must match)"); if (!cin) return;
    const reason = prompt("Reason for reissue (e.g. lost phone)"); if (!reason) return;
    try { const r = await api("POST", `/admin/tickets/${ticketId}/reissue`, { cin, reason }); alert(`Reissued: the old QR code and code no longer work.\n${emailSummary(r.emails)}`); router.refresh(); }
    catch (e) { alert((e as Error).message); }
  }}>Reissue (new QR)</button>;
}

export function ResendEmailButton({ ticketId }: { ticketId: string }) {
  const [busy, setBusy] = useState(false);
  return <button className="btn-secondary block py-1 text-xs" disabled={busy} onClick={async () => {
    if (!confirm("Email this ticket again to its buyer and attendee?")) return;
    setBusy(true);
    try { const r = await api("POST", `/admin/tickets/${ticketId}/resend-email`, {}); alert(emailSummary(r.emails) || "No email address on this ticket."); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }}>{busy ? "Sending…" : "Resend email"}</button>;
}
