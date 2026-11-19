"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/client";

interface T { id: string; serial: string; inventoryStatus: string; paymentStatus: string; admissionStatus: string; holder: string | null; soldBy: string | null }
const pill = (s: string) => <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium">{s.replaceAll("_", " ").toLowerCase()}</span>;

export function TicketBulkTable({ tickets, sellers, salesPoints }: { tickets: T[]; sellers: { id: string; name: string }[]; salesPoints: { id: string; name: string }[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const chosen = tickets.filter((t) => sel.includes(t.id));
  const allOf = (s: string) => chosen.length > 0 && chosen.every((t) => t.inventoryStatus === s);
  const run = async (path: string, body: Record<string, unknown>, confirmMsg: string) => {
    if (!confirm(confirmMsg)) return;
    try { await api("POST", path, { ticketIds: sel, ...body }); setSel([]); router.refresh(); } catch (e) { alert((e as Error).message); }
  };
  const targetBody = () => (target.startsWith("s:") ? { sellerId: target.slice(2) } : target.startsWith("p:") ? { salesPointId: target.slice(2) } : null);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 p-2 text-sm">
        <span>{sel.length} selected</span>
        <select className="input w-auto py-1" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Choose seller / sales point…</option>
          <optgroup label="Sellers">{sellers.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.name}</option>)}</optgroup>
          <optgroup label="Sales points">{salesPoints.map((s) => <option key={s.id} value={`p:${s.id}`}>{s.name}</option>)}</optgroup>
        </select>
        <button className="btn-secondary py-1" disabled={!allOf("AVAILABLE") || !target} onClick={() => run("/admin/tickets/assign", targetBody()!, `Assign ${sel.length} ticket(s)?`)}>Assign</button>
        <button className="btn-secondary py-1" disabled={!allOf("ASSIGNED") || !target} onClick={() => { const reason = prompt("Transfer reason?"); if (reason) run("/admin/tickets/transfer", { ...targetBody(), reason }, `Transfer ${sel.length} ticket(s)?`); }}>Transfer</button>
        <button className="btn-secondary py-1" disabled={!allOf("RETURNED")} onClick={() => { const reason = prompt("Review note?"); if (reason) run("/admin/tickets/review-returned", { decision: "RESTOCK", reason }, "Restock to AVAILABLE?"); }}>Restock returned</button>
        <button className="btn-danger py-1" disabled={!chosen.length || !chosen.every((t) => ["AVAILABLE", "ASSIGNED", "RETURNED"].includes(t.inventoryStatus))} onClick={() => { const reason = prompt("Why void these tickets permanently?"); if (reason) run("/admin/tickets/void", { reason }, `Permanently VOID ${sel.length} unsold ticket(s)? This cannot be undone.`); }}>Void</button>
      </div>
      <div className="max-h-[32rem] overflow-auto">
        <table className="table">
          <thead className="sticky top-0 bg-[var(--surface)]"><tr><th><input type="checkbox" checked={sel.length === tickets.length && tickets.length > 0} onChange={(e) => setSel(e.target.checked ? tickets.map((t) => t.id) : [])} /></th><th>Serial</th><th>Inventory</th><th>Payment</th><th>Admission</th><th>Assigned to</th><th>Sold by</th></tr></thead>
          <tbody>{tickets.map((t) => (
            <tr key={t.id}>
              <td><input type="checkbox" checked={sel.includes(t.id)} onChange={(e) => setSel(e.target.checked ? [...sel, t.id] : sel.filter((x) => x !== t.id))} /></td>
              <td className="num text-xs">{t.serial}</td><td>{pill(t.inventoryStatus)}</td><td>{pill(t.paymentStatus)}</td><td>{pill(t.admissionStatus)}</td>
              <td className="text-xs">{t.holder ?? "—"}</td><td className="text-xs">{t.soldBy ?? "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
