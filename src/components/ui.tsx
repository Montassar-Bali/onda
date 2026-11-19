import Link from "next/link";
import { formatTnd } from "@/lib/money";
import { IconArrowLeft, IconArrowRight } from "./icons";

export type Tone = "blue" | "coral" | "orange" | "green" | "cyan" | "purple";
const tileCls: Record<Tone, string> = { blue: "", coral: "tile-coral", orange: "tile-orange", green: "tile-green", cyan: "tile-cyan", purple: "tile-purple" };

/** Money: tabular figures with TND as a smaller suffix. */
export function Money({ m, className = "", plain = false }: { m: number; className?: string; plain?: boolean }) {
  const s = formatTnd(m, false);
  if (plain) return <span className={`num ${className}`}>{s} TND</span>;
  return <span className={`num whitespace-nowrap ${m < 0 ? "text-[var(--negative)]" : ""} ${className}`}>{s}<span className="ml-1 text-[0.7em] font-semibold text-zinc-500">TND</span></span>;
}

export function IconTile({ tone = "blue", children, small }: { tone?: Tone; children: React.ReactNode; small?: boolean }) {
  return <span className={`tile ${small ? "tile-sm" : ""} ${tileCls[tone]}`}>{children}</span>;
}

/** KPI cards: an icon tile, a label, a value and a note. */
export function Kpis({ children }: { children: React.ReactNode }) { return <div className="kpis">{children}</div>; }
export function Kpi({ label, value, note, tone, icon, color = "blue" }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "neg" | "pos" | "warn"; icon?: React.ReactNode; color?: Tone }) {
  const toneCls = tone === "neg" ? "text-[var(--negative)]" : tone === "pos" ? "text-[var(--positive)]" : tone === "warn" ? "text-[var(--warn-ink)]" : "";
  return (
    <div className="kpi">
      {icon && <IconTile tone={color}>{icon}</IconTile>}
      <div className="min-w-0">
        <div className="kpi-label">{label}</div>
        <div className={`kpi-value ${toneCls}`}>{value}</div>
        {note && <div className="kpi-note">{note}</div>}
      </div>
    </div>
  );
}
export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "default" | "warn" | "good" | "bad" }) {
  return <Kpi label={label} value={value} note={hint} tone={tone === "bad" ? "neg" : tone === "good" ? "pos" : tone === "warn" ? "warn" : undefined} />;
}

const tone: Record<string, string> = {
  PUBLISHED: "pill-pos", DRAFT: "", CLOSED: "", CANCELLED: "pill-neg",
  AVAILABLE: "pill-info", ASSIGNED: "pill-accent", SOLD: "pill-pos", VOID: "pill-neg", RETURNED: "pill-warn",
  NOT_COLLECTED: "", CASH_REPORTED_COLLECTED: "pill-warn", CASH_RECONCILED: "pill-pos", REVERSED: "pill-neg",
  NOT_ELIGIBLE: "", VALID: "pill-pos", CHECKED_IN: "pill-accent", REVOKED: "pill-neg",
  PENDING: "pill-warn", EXPIRED: "", CONVERTED: "pill-pos",
  SETTLED: "pill-pos", OUTSTANDING: "pill-warn", DISCREPANCY: "pill-neg", HANDOVER_PENDING: "pill-info",
  OPEN: "pill-neg", EXPLANATION_REQUIRED: "pill-neg", EXPLAINED: "pill-warn", RESOLVED: "pill-pos",
  SUBMITTED: "pill-info", RECEIVED: "pill-pos", BALANCED: "pill-pos",
  TEAM_LEADER: "pill-accent", TEAM_MEMBER: "", INACTIVE: "pill-neg", SALE: "pill-pos", REVERSAL: "pill-neg",
};
const words: Record<string, string> = {
  CASH_REPORTED_COLLECTED: "Cash with seller", CASH_RECONCILED: "Cash reconciled", NOT_COLLECTED: "Not collected",
  NOT_ELIGIBLE: "Not valid", CHECKED_IN: "Checked in", HANDOVER_PENDING: "Handover to count", EXPLANATION_REQUIRED: "Explanation due",
  TEAM_LEADER: "Team Leader", TEAM_MEMBER: "Team member",
};
const humanize = (s: string) => words[s] ?? s.charAt(0) + s.slice(1).toLowerCase().replaceAll("_", " ");
export function Badge({ children, tone: t }: { children: string; tone?: "green" | "amber" | "red" | "gray" | "blue" }) {
  const cls = t ? { green: "pill-pos", amber: "pill-warn", red: "pill-neg", gray: "", blue: "pill-info" }[t] : tone[children] ?? "";
  return <span className={`pill ${cls}`}>{humanize(children)}</span>;
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-7">
      {back && <Link href={back.href} className="mb-4 inline-flex items-center gap-2 text-[14px] font-medium text-zinc-500 transition-colors hover:text-[var(--primary)]"><span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface)] shadow-[var(--shadow-card)]"><IconArrowLeft size={15} /></span>{back.label}</Link>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold leading-tight tracking-[-0.02em] md:text-[30px]">{title}</h1>
          {subtitle && <div className="mt-2 text-[15px] text-zinc-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}

export function Section({ title, children, aside, className = "", icon, color }: { title: string; children: React.ReactNode; aside?: React.ReactNode; className?: string; icon?: React.ReactNode; color?: Tone }) {
  return (
    <section className={`card ${className}`}>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">{icon && <IconTile tone={color} small>{icon}</IconTile>}<h2 className="text-[17px] font-bold">{title}</h2></div>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** "+N going": coloured initials stack and a count. */
const stackColors = ["#e1102a", "#140b0d", "#ff8a3d", "#9b0015", "#ff3d5a"];
export function Going({ n, className = "" }: { n: number; className?: string }) {
  if (n <= 0) return <span className={`text-[13px] font-semibold text-[var(--primary)] ${className}`}>Be the first to go</span>;
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span className="avatars">{stackColors.slice(0, Math.min(3, n)).map((c, i) => <span key={c} style={{ background: c }}>{"TRP"[i]}</span>)}</span>
      <span className="text-[13px] font-semibold text-[var(--primary)]">+{n} going</span>
    </span>
  );
}


/** The big uppercase call to action with the arrow circle. */
export function CtaLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return <Link href={href} className={`btn-cta ${className}`}>{children}<span className="cta-arrow"><IconArrowRight size={16} /></span></Link>;
}

/**
 * The capacity ledger: the venue's hard limit as one bar. Paid tickets, complimentary tickets and
 * people inside are laid against it; the separate reservation quota sits beneath on its own track.
 */
export function CapacityLedger({ venue, paidCap, paidSold, comp, compCap, inside, reservedPending, reservedQuota }: {
  venue: number; paidCap: number; paidSold: number; comp: number; compCap: number; inside: number; reservedPending: number; reservedQuota: number;
}) {
  const pct = (n: number, of = venue) => `${of ? Math.min(100, (n / of) * 100) : 0}%`;
  const unallocated = venue - paidCap - compCap;
  return (
    <div>
      <div className="relative h-14 overflow-hidden rounded-2xl bg-[var(--raised)]" role="img" aria-label={`Venue ${venue}: ${paidSold} paid sold of ${paidCap}, ${comp} complimentary of ${compCap}, ${inside} inside`}>
        <div className="absolute inset-y-0 left-0 border-r-[3px] border-[var(--surface)] bg-[var(--primary-soft)]" style={{ width: pct(paidCap) }} />
        <div className="absolute inset-y-0 border-r-[3px] border-[var(--surface)] bg-[var(--warn-bg)]" style={{ left: pct(paidCap), width: pct(compCap) }} />
        <div className="absolute inset-y-0 left-0 rounded-r-lg bg-[var(--primary)] transition-[width] duration-700" style={{ width: pct(paidSold) }} />
        <div className="absolute inset-y-0 rounded-r-lg bg-[var(--orange)] transition-[width] duration-700" style={{ left: pct(paidCap), width: pct(comp) }} />
        {inside > 0 && <div className="absolute inset-y-1 w-[3px] rounded bg-[var(--green)]" style={{ left: `calc(${pct(inside)} - 1px)` }} />}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-4">
        <Legend swatch="bg-[var(--primary)]" label="Paid sold" value={`${paidSold}/${paidCap}`} />
        <Legend swatch="bg-[var(--orange)]" label="Complimentary" value={`${comp}/${compCap}`} />
        <Legend swatch="bg-[var(--green)]" label="Inside now" value={`${inside}/${venue}`} />
        <Legend swatch="bg-[var(--raised)] ring-1 ring-inset ring-zinc-300" label="Not allocated" value={String(unallocated)} />
      </div>
      <div className="mt-6 rounded-2xl bg-[var(--warn-bg)] p-4">
        <div className="mb-2 flex items-baseline justify-between gap-3 text-[13.5px]"><span className="font-semibold text-[var(--warn-ink)]">Unpaid reservations · separate quota</span><span className="num font-bold text-[var(--warn-ink)]">{reservedPending}/{reservedQuota}</span></div>
        <div className="h-2.5 overflow-hidden rounded-full bg-[var(--warn-track)]"><div className="h-full rounded-full bg-[var(--orange)]" style={{ width: pct(reservedPending, reservedQuota) }} /></div>
        <p className="mt-2 text-[12.5px] text-[var(--warn-ink)] opacity-80">Never takes a paid place, never counted as revenue.</p>
      </div>
    </div>
  );
}
function Legend({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return <div className="flex items-center gap-2 whitespace-nowrap"><span className={`inline-block h-3 w-3 shrink-0 rounded-full ${swatch}`} /><span className="text-zinc-500">{label}</span><span className="num ml-auto font-bold sm:ml-1">{value}</span></div>;
}

export function Track({ value, of, tone = "accent" }: { value: number; of: number; tone?: "accent" | "warn" | "neg" }) {
  const c = tone === "neg" ? "bg-[var(--negative)]" : tone === "warn" ? "bg-[var(--orange)]" : "bg-[var(--primary)]";
  return <div className="h-2 overflow-hidden rounded-full bg-[var(--primary-track)]"><div className={`h-full rounded-full ${c}`} style={{ width: `${of ? Math.min(100, (value / of) * 100) : 0}%` }} /></div>;
}

/** "ONDA · Brazilian Night": every edition is ONDA, so staff screens show the theme to tell them apart. */
export const editionTitle = (e: { name: string; theme?: string | null }) => (e.theme?.trim() ? `${e.name} · ${e.theme.trim()}` : e.name);

export const fmtDateTime = (d: Date | string) => new Date(d).toLocaleString("fr-TN", { timeZone: "Africa/Tunis", dateStyle: "medium", timeStyle: "short" });
export const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("fr-TN", { timeZone: "Africa/Tunis", weekday: "short", day: "numeric", month: "long" });
export const fmtTime = (d: Date | string) => new Date(d).toLocaleTimeString("fr-TN", { timeZone: "Africa/Tunis", hour: "2-digit", minute: "2-digit" });
