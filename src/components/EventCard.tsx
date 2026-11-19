import Link from "next/link";
import { Going, fmtTime } from "./ui";
import { IconBookmark, IconMapPin } from "./icons";
import { ThemePoster } from "./ThemePoster";

export interface EventCardData { id: string; name: string; theme?: string | null; themeColor?: string | null; venue: string; startsAt: Date; paidSoldCount: number; fromMillimes?: number; reservationsOpen?: boolean }

export function EventCard({ e, className = "", wide = false }: { e: EventCardData; className?: string; wide?: boolean }) {
  const d = new Date(e.startsAt);
  if (wide) return (
    <Link href={`/events/${e.id}`} className={`card lift group grid gap-5 p-3 md:grid-cols-[1.25fr_1fr] ${className}`} data-reveal>
      <ThemePoster id={e.id} theme={e.theme} color={e.themeColor} name={e.name} className="h-64 rounded-2xl md:h-80">
        <span className="date-badge"><b>{d.toLocaleDateString("fr-TN", { timeZone: "Africa/Tunis", day: "numeric" })}</b><span>{d.toLocaleDateString("en-GB", { timeZone: "Africa/Tunis", month: "short" })}</span></span>
        <span className="bookmark"><IconBookmark size={16} /></span>
      </ThemePoster>
      <div className="flex flex-col justify-center px-2 pb-3 md:px-4">
        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--primary)]">{d.toLocaleDateString("en-GB", { timeZone: "Africa/Tunis", weekday: "long", day: "numeric", month: "long" })} · {fmtTime(e.startsAt)}</p>
        <h3 className="mt-2 text-[28px] font-extrabold leading-tight tracking-[-0.02em] transition-colors group-hover:text-[var(--primary)] md:text-[34px]">{e.theme?.trim() || e.name}</h3>
        {e.theme?.trim() && <p className="mt-1 text-[16px] font-semibold text-zinc-500">{e.name}</p>}
        <p className="mt-4 flex items-center gap-1.5 text-[15px] text-zinc-600"><IconMapPin size={16} />{e.venue}</p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Going n={e.paidSoldCount} />
          {e.reservationsOpen && <span className="pill pill-warn">Free reservation open</span>}
        </div>
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-5">
          {e.fromMillimes != null && <span className="text-[14px] text-zinc-500">Tickets from <b className="num text-[22px] text-zinc-900">{(e.fromMillimes / 1000).toFixed(3)}</b> TND</span>}
          <span className="btn-primary h-12 px-6">See edition</span>
        </div>
      </div>
    </Link>
  );
  return (
    <Link href={`/events/${e.id}`} className={`card lift group block p-3 ${className}`} data-reveal>
      <ThemePoster id={e.id} theme={e.theme} color={e.themeColor} name={e.name} size="sm" className="h-52 rounded-2xl">
        <span className="date-badge"><b>{d.toLocaleDateString("fr-TN", { timeZone: "Africa/Tunis", day: "numeric" })}</b><span>{d.toLocaleDateString("en-GB", { timeZone: "Africa/Tunis", month: "short" })}</span></span>
        <span className="bookmark"><IconBookmark size={16} /></span>
        {e.reservationsOpen && <span className="absolute right-3 top-14 rounded-full bg-[var(--orange)] px-3 py-1 text-[12px] font-bold text-white">Free reservation</span>}
      </ThemePoster>
      <div className="px-2 pb-2 pt-4">
        <h3 className="line-clamp-1 text-[19px] font-bold leading-tight transition-colors group-hover:text-[var(--primary)]">{e.name}</h3>
        <div className="mt-3 flex items-center justify-between gap-3">
          <Going n={e.paidSoldCount} />
          {e.fromMillimes != null && <span className="text-[13px] text-zinc-500">from <b className="num text-[15px] text-zinc-900">{(e.fromMillimes / 1000).toFixed(3)}</b> TND</span>}
        </div>
        <p className="mt-3 flex items-center gap-1.5 truncate text-[13.5px] text-zinc-500"><IconMapPin size={15} />{e.venue} · {fmtTime(e.startsAt)}</p>
      </div>
    </Link>
  );
}
