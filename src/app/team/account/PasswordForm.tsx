"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/client";

export function PasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState(""); const [next, setNext] = useState(""); const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null); const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault(); setMsg(null);
      if (next !== again) return setMsg({ kind: "error", text: "The new passwords do not match" });
      setBusy(true);
      const res = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, next }) });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) return setMsg({ kind: "error", text: data?.error?.message ?? "Could not change the password" });
      setCurrent(""); setNext(""); setAgain(""); setMsg({ kind: "success", text: "Password changed. Other devices were signed out." }); router.refresh();
    }}>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div><label className="label" htmlFor="pw-cur">Current password</label><input id="pw-cur" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></div>
      <div><label className="label" htmlFor="pw-new">New password (at least 12 characters)</label><input id="pw-new" className="input" type="password" autoComplete="new-password" minLength={12} value={next} onChange={(e) => setNext(e.target.value)} required /></div>
      <div><label className="label" htmlFor="pw-again">Repeat new password</label><input id="pw-again" className="input" type="password" autoComplete="new-password" minLength={12} value={again} onChange={(e) => setAgain(e.target.value)} required /></div>
      <button className="btn-primary h-12 w-full" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
    </form>
  );
}
