"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconCamera, IconId, IconMail, IconPhone, IconUser } from "./icons";

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, { method, headers: body !== undefined ? { "Content-Type": "application/json" } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `Request failed (${res.status})`);
  return data as T;
}

/** "25.500" helper for display on the client (mirror of lib/money formatTnd). */
export const tnd = (m: number) => `${m < 0 ? "-" : ""}${Math.floor(Math.abs(m) / 1000).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${String(Math.abs(m) % 1000).padStart(3, "0")} TND`;

export interface Person { fullName: string; cin: string; phone: string; email: string }
export const emptyPerson = (): Person => ({ fullName: "", cin: "", phone: "", email: "" });

export function PersonFields({ value, onChange, title, flat }: { value: Person; onChange: (p: Person) => void; title?: string; flat?: boolean }) {
  const set = (k: keyof Person) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <fieldset className={flat ? "rounded-2xl bg-[var(--ground)] p-4 sm:p-5" : "card p-5 sm:p-6"}>
      {title && <legend className="float-left mb-4 w-full text-[16px] font-bold text-zinc-900">{title}</legend>}
      <div className="clear-both grid gap-4 sm:grid-cols-2">
        <div><label className="label">Full name</label><div className="field-icon"><IconUser size={18} /><input className="input" required minLength={3} placeholder="As on the ID card" value={value.fullName} onChange={set("fullName")} autoComplete="off" /></div></div>
        <div><label className="label">National ID (CIN)</label><div className="field-icon"><IconId size={18} />
          <input className="input tracking-[0.18em]" required inputMode="numeric" pattern="\d{8}" maxLength={8} placeholder="8 digits" value={value.cin} onChange={(e) => onChange({ ...value, cin: e.target.value.replace(/\D/g, "").slice(0, 8) })} autoComplete="off" /></div></div>
        <div><label className="label">Phone</label><div className="field-icon"><IconPhone size={18} /><input className="input" required inputMode="tel" placeholder="+216 20 123 456" value={value.phone} onChange={set("phone")} autoComplete="off" /></div></div>
        <div><label className="label">Email</label><div className="field-icon"><IconMail size={18} /><input className="input" required type="email" placeholder="name@email.com" value={value.email} onChange={set("email")} autoComplete="off" /></div></div>
      </div>
    </fieldset>
  );
}

export function Alert({ kind, children }: { kind: "error" | "success" | "warn" | "info"; children: React.ReactNode }) {
  const cls = { error: "bg-[var(--neg-bg)] text-[var(--neg-ink)]", success: "bg-[var(--pos-bg)] text-[var(--pos-ink)]", warn: "bg-[var(--warn-bg)] text-[var(--warn-ink)]", info: "bg-[var(--primary-soft)] text-[var(--primary-ink)]" }[kind];
  return <div role={kind === "error" ? "alert" : "status"} className={`pop rounded-2xl px-4 py-3.5 text-[14px] font-medium leading-5 ${cls}`}>{children}</div>;
}

/** Generic one-shot action button (POST + refresh). */
export function ActionButton({ method = "POST", path, body, label, confirm, className = "btn-secondary", prompt, promptKey = "reason", onDone }: {
  method?: string; path: string; body?: Record<string, unknown>; label: string; confirm?: string; className?: string; prompt?: string; promptKey?: string; onDone?: (r: any) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={className} disabled={busy} onClick={async () => {
      if (confirm && !window.confirm(confirm)) return;
      let extra: Record<string, unknown> = {};
      if (prompt) { const v = window.prompt(prompt); if (!v) return; extra = { [promptKey]: v }; }
      setBusy(true);
      try { const r = await api(method, path, { ...(body ?? {}), ...extra }); onDone?.(r); router.refresh(); }
      catch (e) { alert((e as Error).message); }
      finally { setBusy(false); }
    }}>{busy ? "…" : label}</button>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return <button className="text-sm text-zinc-600 hover:text-zinc-900" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }}>Sign out</button>;
}

/**
 * Camera QR scanner (getUserMedia + jsQR) with a manual-entry fallback.
 * Calls onScan once per distinct code; pauses while `paused` is true.
 */
export function QrScanner({ onScan, paused }: { onScan: (text: string) => void; paused?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const last = useRef<{ text: string; at: number } | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null, raf = 0, stopped = false;
    (async () => {
      try {
        const jsQR = (await import("jsqr")).default;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = videoRef.current!;
        v.srcObject = stream; await v.play();
        const tick = () => {
          if (stopped) return;
          const c = canvasRef.current!, ctx = c.getContext("2d", { willReadFrequently: true })!;
          if (v.readyState === v.HAVE_ENOUGH_DATA && !pausedRef.current) {
            // 1) the whole frame downscaled to ≤ 720 px (large frames full of ticket artwork confuse the
            //    finder-pattern search); 2) the centre of the frame at full resolution (small or distant QRs).
            const s = Math.min(1, 720 / v.videoWidth);
            c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
            ctx.drawImage(v, 0, 0, c.width, c.height);
            let code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: "dontInvert" });
            if (!code) {
              const side = Math.round(Math.min(v.videoWidth, v.videoHeight) * 0.6);
              c.width = side; c.height = side;
              ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, side, side);
              code = jsQR(ctx.getImageData(0, 0, side, side).data, side, side, { inversionAttempts: "dontInvert" });
            }
            if (code?.data) {
              const now = Date.now();
              if (!last.current || last.current.text !== code.data || now - last.current.at > 4000) { last.current = { text: code.data, at: now }; onScan(code.data); }
            }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) { setError("Camera unavailable: " + (e as Error).message + ". Use manual entry."); setActive(false); }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [active, onScan]);

  return (
    <div className="space-y-3">
      <div className="hero relative overflow-hidden rounded-2xl" style={{ aspectRatio: active ? "4/3" : undefined }}>
        {active ? (
          <>
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            <div className="pointer-events-none absolute inset-[16%] rounded-3xl border-[3px] border-white/90" />
          </>
        ) : (
          <button type="button" className="flex w-full flex-col items-center gap-3 py-12 text-white transition-colors hover:bg-white/5" onClick={() => { setError(null); setActive(true); }}>
            <span className="grid h-16 w-16 place-items-center rounded-full bg-white/20"><IconCamera size={28} /></span>
            <span className="text-[16px] font-bold">Start camera</span>
            <span className="text-[13px] text-white/70">Point at the QR code on the ticket</span>
          </button>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>
      {active && <button type="button" className="btn-secondary w-full" onClick={() => setActive(false)}>Stop camera</button>}
      {error && <Alert kind="warn">{error}</Alert>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { onScan(manual.trim()); setManual(""); } }}>
        <input className="input uppercase tracking-[0.12em] placeholder:normal-case placeholder:tracking-normal" placeholder="Or type the code: XXXX-XXXX-XXXX" aria-label="Ticket code printed under the QR" autoCapitalize="characters" autoComplete="off" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button className="btn-secondary">Submit</button>
      </form>
    </div>
  );
}

/** Extracts the opaque token from a scanned value (raw token or a /t/<token> URL). */
export const extractToken = (s: string) => { const m = /\/t\/([A-Za-z0-9_-]+)/.exec(s); return m ? m[1] : s.trim(); };

/**
 * Generic form → JSON API. Inputs are read by `name`: checkboxes become booleans,
 * multi-selects / checkbox groups with name ending in [] become arrays, empty strings become null.
 */
export function ApiForm({ method = "POST", path, children, submitLabel = "Save", className = "space-y-3", extra, onDone, resetOnSuccess, successMessage }: {
  method?: string; path: string; children: React.ReactNode; submitLabel?: string; className?: string; extra?: Record<string, unknown>;
  onDone?: (r: any) => void; resetOnSuccess?: boolean; successMessage?: string;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  return (
    <form className={className} onSubmit={async (e) => {
      e.preventDefault(); setErr(null); setOk(null); setBusy(true);
      const form = e.currentTarget; const body: Record<string, unknown> = { ...(extra ?? {}) };
      for (const el of Array.from(form.elements) as (HTMLInputElement & HTMLSelectElement)[]) {
        if (!el.name || el.disabled) continue;
        const type: string = el.type;
        if (el.name.endsWith("[]")) {
          const k = el.name.slice(0, -2); const arr = (body[k] as unknown[]) ?? [];
          if (type === "checkbox") { if (el.checked) arr.push(el.value); } else if (el.multiple) arr.push(...Array.from(el.selectedOptions).map((o) => o.value)); else arr.push(el.value);
          body[k] = arr;
        } else if (type === "checkbox") body[el.name] = el.checked;
        else if (type === "datetime-local") body[el.name] = el.value ? new Date(el.value).toISOString() : null;
        else body[el.name] = el.value === "" ? null : el.value;
      }
      try { const r = await api(method, path, body); setOk(successMessage ?? "Saved"); if (resetOnSuccess) form.reset(); onDone?.(r); router.refresh(); }
      catch (e2) { setErr((e2 as Error).message); }
      finally { setBusy(false); }
    }}>
      {children}
      {err && <Alert kind="error">{err}</Alert>}
      {ok && <Alert kind="success">{ok}</Alert>}
      <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
    </form>
  );
}

export interface EmailReport { to: string; status: "SENT" | "SAVED_LOCALLY" | "FAILED"; tickets: number; error?: string }
/** Where the tickets went: shown to staff after every sale, activation, conversion or resend. */
export function EmailReportList({ emails }: { emails?: EmailReport[] }) {
  if (!emails?.length) return null;
  return (
    <ul className="space-y-2">
      {emails.map((e) => (
        <li key={e.to} className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-[14px] ${e.status === "SENT" ? "bg-[var(--pos-bg)] text-[var(--pos-ink)]" : e.status === "FAILED" ? "bg-[var(--neg-bg)] text-[var(--neg-ink)]" : "bg-[var(--warn-bg)] text-[var(--warn-ink)]"}`}>
          <span className="mt-0.5 font-bold">{e.status === "SENT" ? "✓" : e.status === "FAILED" ? "!" : "•"}</span>
          <span className="min-w-0">
            <span className="block font-semibold">{e.status === "SENT" ? "Emailed" : e.status === "FAILED" ? "Email failed" : "Email not sent (no mail server configured)"} · {e.tickets} ticket{e.tickets > 1 ? "s" : ""}</span>
            <span className="block truncate opacity-90">{e.to}{e.error ? ` — ${e.error}` : ""}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
export const emailSummary = (emails?: EmailReport[]) => (emails ?? []).map((e) => `${e.status === "SENT" ? "Emailed" : e.status === "FAILED" ? "FAILED" : "Not sent (no mail server)"}: ${e.to}`).join("\n");
