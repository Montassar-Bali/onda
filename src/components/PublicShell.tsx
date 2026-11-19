import Link from "next/link";
import { Logo } from "./Logo";
import { VenueLogo } from "./Venue";
import { ThemeButton } from "./ThemeToggle";

/** Top bar. `onHero` renders it transparent with white text, for pages that open on the blue header. */
export function PublicNav({ onHero = false }: { onHero?: boolean }) {
  const link = onHero ? "text-white/85 hover:text-white" : "text-zinc-600 hover:text-[var(--primary)]";
  return (
    <header className={onHero ? "" : "bg-[var(--surface)] shadow-[0_2px_16px_rgba(40,10,15,0.06)]"}>
      <div className="mx-auto flex h-[72px] max-w-[1200px] items-center gap-6 px-5 md:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo height={onHero ? 52 : 46} priority className={onHero ? "logo-glow" : "logo-auto"} />
        </Link>
        <nav className="ml-auto flex items-center gap-5 text-[15px] font-semibold md:gap-8">
          <Link href="/#editions" className={`transition-colors ${link}`}>Editions</Link>
          <Link href="/#how" className={`hidden transition-colors sm:inline ${link}`}>How it works</Link>
          <ThemeButton onHero={onHero} />
          <Link href="/login" className={onHero ? "btn h-10 bg-white/15 px-4 text-white hover:bg-white/25" : "btn-soft h-10 px-4"}>Staff</Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicShell({ children, bare = false }: { children: React.ReactNode; bare?: boolean }) {
  return (
    <div className="min-h-dvh bg-[var(--ground)]">
      {!bare && <PublicNav />}
      <main className={bare ? "" : "mx-auto max-w-[1200px] px-5 py-10 md:px-8 md:py-14"}>{children}</main>
      <footer className="hero mt-24 text-white">
        <div className="mx-auto max-w-[1200px] px-5 pb-10 pt-14 md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <Logo height={72} className="logo-glow" />
            <Link href="/#editions" className="btn-primary h-12 px-6">Next edition</Link>
          </div>
          <div className="mt-10 grid gap-8 text-[14px] leading-6 text-white/70 md:grid-cols-3">
            <p className="flex items-start gap-3"><VenueLogo size={44} /><span>ONDA is our night at Tropical Bar, with a new theme every edition. Tickets are sold for cash only, in Tunisian dinars, by our team and authorized sales points.</span></p>
            <p>Your national ID is encrypted, never printed on a ticket and never placed in a QR code. It only proves the ticket is yours.</p>
            <ul className="space-y-1.5"><li><Link href="/#editions" className="hover:text-white">Upcoming editions</Link></li><li><Link href="/#how" className="hover:text-white">How it works</Link></li><li><Link href="/login" className="hover:text-white">Staff sign in</Link></li></ul>
          </div>
          <p className="mt-12 border-t border-white/10 pt-6 text-[12.5px] text-white/50">ONDA · Tropical Bar</p>
        </div>
      </footer>
    </div>
  );
}
