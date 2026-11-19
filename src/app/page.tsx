import Link from "next/link";
import { prisma } from "@/lib/db";
import { listPublishedEvents } from "@/services/events";
import { PublicNav, PublicShell } from "@/components/PublicShell";
import { EventCard } from "@/components/EventCard";
import { ThemePoster, Swoosh } from "@/components/ThemePoster";
import { AtVenue, HOME_VENUE, VenueLogo } from "@/components/Venue";
import { Logo } from "@/components/Logo";
import { Going, fmtTime } from "@/components/ui";
import { IconArrowRight, IconCalendar, IconCash, IconGift, IconId, IconSparkle, IconTag, IconUsers, Sparkle } from "@/components/icons";
import { Reveal } from "@/components/Reveal";

export const dynamic = "force-dynamic";

const filters = [
  { key: "", label: "All editions", cls: "chip-purple", I: IconSparkle },
  { key: "month", label: "This month", cls: "chip-coral", I: IconCalendar },
  { key: "reserve", label: "Free reservation", cls: "chip-orange", I: IconUsers },
  { key: "budget", label: "Under 30 TND", cls: "chip-cyan", I: IconTag },
];

const longDate = (d: Date) => new Date(d).toLocaleDateString("en-GB", { timeZone: "Africa/Tunis", weekday: "long", day: "numeric", month: "long" });

export default async function Home({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f = "" } = await searchParams;
  const [all, past] = await Promise.all([
    listPublishedEvents(),
    prisma.event.findMany({ where: { status: { in: ["PUBLISHED", "CLOSED"] }, endsAt: { lt: new Date() } }, orderBy: { startsAt: "desc" }, take: 6, select: { id: true, name: true, theme: true, themeColor: true } }),
  ]);
  const now = new Date();
  const resOpen = (e: (typeof all)[number]) => { const r = e.reservationInventory; return !!r?.enabled && now >= r.opensAt && now <= r.closesAt && r.pendingAttendees < r.maxReservedAttendees; };
  const events = all.filter((e) => {
    if (f === "month") return new Date(e.startsAt).getTime() - now.getTime() < 31 * 86400000;
    if (f === "reserve") return resOpen(e);
    if (f === "budget") return (e.categories[0]?.priceMillimes ?? Infinity) <= 30000;
    return true;
  });
  const next = all[0];
  const days = next ? Math.max(0, Math.ceil((new Date(next.startsAt).getTime() - now.getTime()) / 86400000)) : null;
  const href = (key: string) => `/${key ? `?f=${key}` : ""}#editions`;

  return (
    <PublicShell bare>
      <Reveal />
      {/* black chrome header: the ONDA logo, the venue, the next edition */}
      <section className="hero relative overflow-hidden rounded-b-[40px] pb-16">
        <Sparkle size={40} className="sparkle left-[46%] top-[22%]" />
        <Sparkle size={18} className="sparkle left-[8%] top-[80%]" style={{ animationDelay: "1.2s" }} />
        <Sparkle size={14} className="sparkle right-[6%] bottom-[14%]" style={{ animationDelay: "2.1s" }} />
        <PublicNav onHero />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-10 px-5 pt-6 md:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:pt-10">
          <div data-reveal>
            <Logo height={150} priority className="logo-glow -ml-2 h-auto w-[230px] md:w-[300px]" />
            <AtVenue className="mt-5" />
            <h1 className="mt-5 text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] md:text-[60px]">A <span className="chrome-text">new theme</span> every edition</h1>
            <p className="mt-5 max-w-[34rem] text-[17px] leading-7 text-white/85">ONDA is our night at {HOME_VENUE}. Every edition has its own theme and its own date. Pay cash to our team, or reserve a place for free and pay later.</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              {next ? (
                <>
                  <Link href={`/events/${next.id}`} className="btn-cta">Next edition<span className="cta-arrow"><IconArrowRight size={16} /></span></Link>
                  <span className="text-[15px] text-white/80">{days === 0 ? "Tonight" : `In ${days} day${days === 1 ? "" : "s"}`} · {longDate(next.startsAt)}</span>
                </>
              ) : <span className="text-[15px] text-white/80">The next edition will be announced here.</span>}
            </div>
          </div>
          {next && (
            <Link href={`/events/${next.id}`} className="relative mx-auto hidden w-full max-w-[400px] lg:block" data-reveal>
              <div className="absolute inset-0 translate-x-6 translate-y-4 rotate-[7deg] rounded-[30px] bg-white/15" />
              <div className="relative -rotate-[4deg] rounded-[30px] bg-[var(--surface)] p-3 text-zinc-900 shadow-[0_30px_60px_rgba(20,11,13,0.45)] transition-transform duration-500 hover:rotate-0">
                <ThemePoster id={next.id} theme={next.theme} color={next.themeColor} name={next.name} className="h-64 rounded-[22px]" />
                <div className="px-3 pb-3 pt-4">
                  <p className="text-[13px] font-bold text-[var(--primary)]">{new Date(next.startsAt).toLocaleDateString("en-GB", { timeZone: "Africa/Tunis", weekday: "short", day: "numeric", month: "long" }).toUpperCase()} · {fmtTime(next.startsAt)}</p>
                  <p className="mt-1.5 text-[22px] font-extrabold leading-tight tracking-[-0.02em]">{next.name}</p>
                  <div className="mt-3 flex items-center justify-between"><Going n={next.paidSoldCount} /><span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--primary)] text-white"><IconArrowRight size={18} /></span></div>
                </div>
              </div>
            </Link>
          )}
        </div>
      </section>

      {/* chips overlapping the header */}
      <div className="relative z-10 mx-auto -mt-6 max-w-[1200px] px-5 md:px-8">
        <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-3 pt-1 [scrollbar-width:none] md:mx-0 md:px-0">
          {filters.map(({ key, label, cls, I }) => (
            <Link key={label} href={href(key)} className={`chip ${f === key ? cls : "chip-off"}`} aria-current={f === key ? "true" : undefined}><I size={18} />{label}</Link>
          ))}
        </div>
      </div>

      {/* upcoming editions */}
      <section id="editions" className="mx-auto max-w-[1200px] scroll-mt-4 px-5 pt-10 md:px-8">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 className="text-[24px] font-extrabold tracking-[-0.02em] md:text-[30px]">Upcoming editions</h2>
          {f && <Link href="/#editions" className="text-[15px] font-semibold text-[var(--primary)]">Clear ›</Link>}
        </div>
        {events.length === 0 ? (
          <div className="empty min-h-40 text-[16px]">{all.length === 0 ? "No edition on sale right now. The next theme is announced here first." : "No edition matches this filter."}</div>
        ) : (
          <div className={events.length === 1 ? "" : "-mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-6 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-3"}>
            {events.map((e) => (
              <EventCard key={e.id} wide={events.length === 1} className={events.length === 1 ? "" : "w-[82vw] max-w-[360px] shrink-0 snap-start md:w-auto md:max-w-none"}
                e={{ id: e.id, name: e.name, theme: e.theme, themeColor: e.themeColor, venue: e.venue, startsAt: e.startsAt, paidSoldCount: e.paidSoldCount, fromMillimes: e.categories[0]?.priceMillimes, reservationsOpen: resOpen(e) }} />
            ))}
          </div>
        )}
      </section>

      {/* the venue: same place, new theme */}
      <section className="mx-auto mt-16 max-w-[1200px] px-5 md:px-8" data-reveal>
        <div className="card grid items-center gap-8 p-7 md:grid-cols-[auto_1fr] md:p-10">
          <div className="relative mx-auto">
            <VenueLogo size={190} className="shadow-[0_20px_50px_rgba(0,112,185,0.25)]" />
            <Sparkle size={30} className="sparkle -right-2 top-2" />
          </div>
          <div>
            <h2 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] md:text-[36px]">Same place, new theme every time</h2>
            <p className="mt-3 max-w-[40rem] text-[16px] leading-7 text-zinc-600">Every ONDA edition takes place at {HOME_VENUE}. The theme and the date change from one edition to the next; the address stays the same.</p>
            {past.length > 0 && (
              <div className="mt-6">
                <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-zinc-500">Previous themes</p>
                <div className="mt-3 flex flex-wrap gap-2">{past.map((p) => <span key={p.id} className="pill pill-accent">{p.theme || p.name}</span>)}</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* how tickets work */}
      <section id="how" className="mx-auto mt-16 max-w-[1200px] scroll-mt-4 px-5 md:px-8">
        <h2 className="text-[28px] font-extrabold tracking-[-0.02em] md:text-[36px]" data-reveal>How tickets work</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { I: IconCash, t: "", h: "Pay in cash to a person you can see", p: "ONDA team members and authorized sales points sell at the official price in dinars. No online payment, no card details to leak." },
            { I: IconId, t: "tile-cyan", h: "Your ID card makes the ticket yours", p: "Each attendee gives a national ID number. It is encrypted and never printed; it lets us reissue a lost ticket only to you." },
            { I: IconUsers, t: "tile-orange", h: "A reservation is not a seat", p: "Reserving is free and separate from tickets. Paid holders always come first, so pay before it expires." },
          ].map(({ I, t, h, p }) => (
            <div key={h} className="card p-6" data-reveal>
              <span className={`tile ${t}`}><I size={22} /></span>
              <h3 className="mt-4 text-[17px] font-bold">{h}</h3>
              <p className="mt-1.5 text-[15px] leading-6 text-zinc-600">{p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* reserve for free */}
      <section className="mx-auto mt-16 max-w-[1200px] px-5 md:px-8" data-reveal>
        <div className="hero relative overflow-hidden rounded-[28px] p-7 md:p-12">
          <Swoosh gid="promo-swoosh" className="pointer-events-none absolute -right-24 -top-6 w-[620px] max-w-none rotate-[-12deg] opacity-80" />
          <Sparkle size={26} className="sparkle right-[34%] top-8" />
          <div className="relative max-w-[34rem]">
            <span className="tile bg-white/10 text-[#ff6b7d]"><IconGift size={24} /></span>
            <h2 className="mt-5 text-[26px] font-extrabold leading-tight tracking-[-0.02em] md:text-[34px]">Reserve now, pay in cash later</h2>
            <p className="mt-3 text-[16px] leading-6 text-white/75">Hold places for your whole group for free. You get a code by email. Pay any ONDA seller before it expires to get your tickets.</p>
            <Link href={href("reserve")} className="btn-primary mt-6 h-12 px-6 font-bold uppercase tracking-[0.06em]">Reserve</Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
