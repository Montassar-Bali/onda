"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert } from "@/components/client";
import { IconArrowRight, IconMail, IconShield, Sparkle } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { ThemeButton } from "@/components/ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div className="hero relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/[0.07]" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/[0.05]" />
        <Link href="/" className="relative"><Logo height={110} priority className="logo-glow" /></Link>
        <Sparkle size={34} className="sparkle right-[18%] top-[30%]" />
        <Sparkle size={16} className="sparkle left-[12%] top-[58%]" style={{ animationDelay: "1.3s" }} />
        <div className="relative">
          <h1 className="text-[48px] font-extrabold leading-[1.05] tracking-[-0.03em]">Sell, scan and count, all from one app</h1>
          <p className="mt-5 max-w-[28rem] text-[17px] leading-7 text-white/80">For ONDA team members and Team Leaders. Cash sales in dinars, QR check-in at the gate, seller cash reconciliation.</p>
        </div>
        <p className="relative text-[13px] text-white/60">Staff access only. Every action is recorded.</p>
      </div>
      <div className="relative flex flex-col justify-center px-5 py-12 sm:px-10">
        <div className="absolute right-5 top-5"><ThemeButton /></div>
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-8 flex justify-center lg:hidden"><Logo height={84} priority /></div>
          <h2 className="text-[28px] font-extrabold tracking-[-0.02em]">Sign in</h2>
          <p className="mt-1.5 text-[15px] text-zinc-500">Use the staff account your Team Leader created.</p>
          <form className="mt-8 space-y-5" onSubmit={async (e) => {
            e.preventDefault(); setBusy(true); setError(null);
            const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
            const data = await res.json().catch(() => ({}));
            setBusy(false);
            if (!res.ok) return setError(data?.error?.message ?? "Sign in failed");
            router.push(data.redirect); router.refresh();
          }}>
            {error && <Alert kind="error">{error}</Alert>}
            <div className="field-icon"><IconMail size={20} /><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="name@email.com" aria-label="Email" /></div>
            <div className="field-icon"><IconShield size={20} /><input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Your password" aria-label="Password" /></div>
            <button className="btn-cta w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<span className="cta-arrow"><IconArrowRight size={16} /></span></button>
          </form>
          <Link href="/" className="mt-8 block text-center text-[15px] font-semibold text-[var(--primary)]">← Back to public events</Link>
        </div>
      </div>
    </main>
  );
}
