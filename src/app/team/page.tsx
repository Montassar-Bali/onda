import Link from "next/link";
import { pageActor } from "@/server/auth";
import { teamEvents } from "@/server/team-data";
import { Going, Money, fmtTime, editionTitle } from "@/components/ui";
import { ThemePoster } from "@/components/ThemePoster";
import { IconBookmark, IconCash, IconMapPin, IconScan, IconTicket, IconUsers } from "@/components/icons";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TeamHome() {
  const actor = await pageActor();
  const events = await teamEvents(actor);
  const accounts = await prisma.sellerCashAccount.findMany({ where: { sellerId: actor.id } });
  const acc = new Map(accounts.map((a) => [a.eventId, a]));
  const owedTotal = accounts.reduce((s, a) => s + a.expectedMillimes - a.reconciledMillimes, 0);
  const first = actor.name.split(/[\s(]/)[0];
  const next = events[0];

  return (
    <>
      {/* greeting header */}
      <section className="hero relative -mx-4 -mt-5 overflow-hidden rounded-b-[32px] px-5 pb-20 pt-7 md:mx-0 md:mt-0 md:rounded-[28px] md:px-8 md:pb-24 md:pt-9">
        <p className="text-[15px] text-white/80">Hello {first} 👋</p>
        <h1 className="mt-1 text-[28px] font-extrabold leading-tight tracking-[-0.02em] md:text-[34px]">Ready for tonight?</h1>
        <div className="mt-5 inline-flex items-center gap-3 rounded-2xl bg-white/15 px-4 py-3 backdrop-blur-sm">
          <IconCash size={20} />
          <span className="text-[14px]">{owedTotal > 0 ? <>You are holding <Money m={owedTotal} className="font-bold text-white [&>span]:text-white/80" /> for the Team Leader</> : "No cash to hand over"}</span>
        </div>
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-white/5" />
      </section>

      {/* quick actions overlapping the header */}
      {next && (
        <div className="relative -mt-12 grid grid-cols-4 gap-3 px-1 md:px-6">
          {[
            { href: `/team/${next.id}/sell`, l: "Sell", I: IconCash, c: "chip-coral" },
            { href: `/team/${next.id}/activate`, l: "Printed", I: IconTicket, c: "chip-orange" },
            { href: `/team/${next.id}/scan`, l: "Gate", I: IconScan, c: "chip-green" },
            { href: `/team/${next.id}/reservations`, l: "Reserved", I: IconUsers, c: "chip-cyan" },
          ].map(({ href, l, I, c }) => (
            <Link key={l} href={href} className="lift flex flex-col items-center gap-2 rounded-[22px] bg-[var(--surface)] px-1 py-4 shadow-[var(--shadow-card)]">
              <span className={`chip ${c} h-12 w-12 justify-center p-0`}><I size={22} /></span>
              <span className="text-[13px] font-bold">{l}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mb-4 mt-9 flex items-baseline justify-between">
        <h2 className="text-[20px] font-bold tracking-[-0.01em]">My events</h2>
        <Link href="/team/cash" className="text-[14px] font-semibold text-[var(--primary)]">My cash ›</Link>
      </div>
      {events.length === 0 && <div className="empty">You are not assigned to any published event yet. Ask your Team Leader.</div>}
      <div className="grid gap-5 md:grid-cols-2">
        {events.map((e) => {
          const a = acc.get(e.id);
          const d = new Date(e.startsAt);
          return (
            <article key={e.id} className="card lift p-3">
              <ThemePoster id={e.id} theme={e.theme} color={e.themeColor} name={e.name} size="sm" className="h-44 rounded-2xl">
                <span className="date-badge"><b>{d.toLocaleDateString("fr-TN", { timeZone: "Africa/Tunis", day: "numeric" })}</b><span>{d.toLocaleDateString("en-GB", { timeZone: "Africa/Tunis", month: "short" })}</span></span>
                <span className="bookmark"><IconBookmark size={16} /></span>
              </ThemePoster>
              <div className="px-2 pb-2 pt-4">
                <h3 className="text-[19px] font-bold leading-tight">{editionTitle(e)}</h3>
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <Going n={e.paidSoldCount} />
                  {a && <span className="text-right text-[13px] text-zinc-500">You owe <Money m={a.expectedMillimes - a.reconciledMillimes} className="font-bold text-zinc-900" /></span>}
                </div>
                <p className="mt-2.5 flex items-center gap-1.5 text-[13.5px] text-zinc-500"><IconMapPin size={15} />{e.venue} · {fmtTime(e.startsAt)}</p>
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <Link className="btn-primary h-12" href={`/team/${e.id}/sell`}><IconCash size={18} />Sell ticket</Link>
                  <Link className="btn-soft h-12" href={`/team/${e.id}/scan`}><IconScan size={18} />Gate scan</Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
