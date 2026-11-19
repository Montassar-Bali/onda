import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PublicNav, PublicShell } from "@/components/PublicShell";
import { Going, Money, fmtDateTime, fmtTime } from "@/components/ui";
import { ThemePoster, chromeFor } from "@/components/ThemePoster";
import { VenueLogo } from "@/components/Venue";
import { Logo } from "@/components/Logo";
import { IconArrowLeft, IconArrowRight, IconBookmark, IconCalendar, IconCash } from "@/components/icons";
import { ReservationForm } from "./ReservationForm";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await prisma.event.findFirst({ where: { id, status: "PUBLISHED" }, include: { categories: { where: { active: true }, orderBy: { priceMillimes: "asc" } }, reservationInventory: true } });
  if (!e) notFound();
  const inv = e.reservationInventory;
  const now = new Date();
  const resOpen = !!inv?.enabled && now >= inv.opensAt && now <= inv.closesAt && inv.pendingAttendees < inv.maxReservedAttendees;
  const d = new Date(e.startsAt);
  const dateLine = d.toLocaleDateString("en-GB", { timeZone: "Africa/Tunis", day: "numeric", month: "long", year: "numeric" });
  const dayLine = `${d.toLocaleDateString("en-GB", { timeZone: "Africa/Tunis", weekday: "long" })}, ${fmtTime(e.startsAt)} – ${fmtTime(e.endsAt)}`;
  const from = e.categories[0]?.priceMillimes;

  return (
    <PublicShell bare>
      {/* cover */}
      <ThemePoster id={e.id} theme={e.theme} color={e.themeColor} name={e.name} size="lg" showName={false} className="h-[340px] rounded-b-[36px] md:h-[440px]">
        <div className="relative text-white"><PublicNav onHero /></div>
        <div className="absolute inset-x-0 bottom-12 mx-auto max-w-[1200px] px-5 md:px-8">
          {e.theme && <p className="text-[13px] font-bold uppercase tracking-[0.16em] text-white/70">This edition&apos;s theme</p>}
          <p className="mt-1 max-w-[16ch] text-[44px] font-extrabold leading-[1] tracking-[-0.03em] md:text-[72px]" style={chromeFor(e.id, e.themeColor)}>{e.theme || e.name}</p>
        </div>
        <div className="absolute inset-x-0 top-[84px] mx-auto flex max-w-[1200px] items-center justify-between px-5 md:px-8">
          <Link href="/#editions" className="flex items-center gap-2 text-[17px] font-bold text-white"><IconArrowLeft size={22} />All editions</Link>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/25 text-white backdrop-blur-sm"><IconBookmark size={18} /></span>
        </div>
      </ThemePoster>

      {/* floating "going" pill */}
      <div className="relative z-10 mx-auto -mt-8 flex max-w-[1200px] justify-center px-5 md:px-8">
        <div className="flex items-center gap-5 rounded-full bg-[var(--surface)] px-5 py-3 shadow-[var(--shadow-float)]">
          <Going n={e.paidSoldCount} />
          {resOpen ? <a href="#reserve" className="btn h-9 rounded-xl bg-[var(--primary)] px-4 text-[13px] font-bold text-white">Reserve</a> : <span className="text-[13px] font-semibold text-zinc-500">Cash tickets</span>}
        </div>
      </div>

      <div className="mx-auto grid max-w-[1200px] gap-10 px-5 pt-8 md:px-8 lg:grid-cols-[1fr_440px]">
        <div>
          <h1 className="text-[34px] font-extrabold leading-[1.1] tracking-[-0.03em] md:text-[44px]">{e.name}</h1>
          <div className="mt-7 space-y-5">
            <div className="flex items-center gap-4"><span className="tile"><IconCalendar size={22} /></span><div><p className="text-[16px] font-bold">{dateLine}</p><p className="text-[14px] text-zinc-500">{dayLine}</p></div></div>
            <div className="flex items-center gap-4"><VenueLogo size={48} /><div><p className="text-[16px] font-bold">{e.venue}</p><p className="text-[14px] text-zinc-500">Venue · every ONDA edition takes place here</p></div></div>
            <div className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-[14px] bg-[#0b0506]"><Logo height={20} /></span><div><p className="text-[16px] font-bold">ONDA</p><p className="text-[14px] text-zinc-500">Organizer</p></div></div>
          </div>

          {e.description && (
            <div className="mt-9">
              <h2 className="text-[19px] font-bold">About event</h2>
              <p className="mt-2.5 whitespace-pre-line text-[16px] leading-7 text-zinc-600">{e.description}</p>
            </div>
          )}

          <div className="mt-9">
            <h2 className="text-[19px] font-bold">Tickets</h2>
            <p className="mt-1 text-[15px] text-zinc-500">Official prices, cash only. Buy from an ONDA team member or an authorized sales point.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {e.categories.map((c, i) => (
                <div key={c.id} className="card flex items-center gap-4 p-4">
                  <span className={`tile ${["", "tile-orange", "tile-green", "tile-cyan"][i % 4]}`}><IconCash size={22} /></span>
                  <div className="min-w-0 flex-1"><p className="text-[16px] font-bold">{c.name}</p><p className="text-[13px] text-zinc-500">Per person</p></div>
                  <Money m={c.priceMillimes} className="text-[20px] font-extrabold" />
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-3 rounded-2xl bg-[var(--primary-soft)] p-4 text-[14px] leading-6 text-[var(--primary-ink)]">
              <span className="font-bold">At the gate:</span> show the QR code from your email or PDF and your national ID card. One ticket, one entry.
            </div>
          </div>
        </div>

        <div id="reserve" className="scroll-mt-6 lg:sticky lg:top-6 lg:self-start">
          {resOpen ? (
            <ReservationForm eventId={e.id} categories={e.categories.map((c) => ({ id: c.id, name: c.name, priceMillimes: c.priceMillimes }))} maxAttendees={inv!.maxTicketsPerReservation} />
          ) : (
            <div className="card p-7">
              <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">Reservations</h2>
              <p className="mt-2 text-[15px] leading-6 text-zinc-600">{!inv?.enabled ? "Reservations are not offered for this event. Buy a ticket in cash from our team." : now < inv.opensAt ? `Reservations open ${fmtDateTime(inv.opensAt)}.` : now > inv.closesAt ? "Reservations are closed. Tickets are still sold in cash while they last." : "The reservation quota is full. Tickets are still sold in cash while they last."}</p>
            </div>
          )}
        </div>
      </div>

      {/* phone: sticky call to action */}
      {resOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 bar px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(40,10,15,0.12)] lg:hidden">
          <div className="flex items-center gap-4">
            {from != null && <div className="shrink-0"><p className="text-[12px] text-zinc-500">Tickets from</p><p className="num text-[18px] font-extrabold">{(from / 1000).toFixed(3)} <span className="text-[12px] font-semibold text-zinc-500">TND</span></p></div>}
            <a href="#reserve" className="btn-cta min-w-0 flex-1 px-5 pr-14">Reserve<span className="cta-arrow"><IconArrowRight size={16} /></span></a>
          </div>
        </div>
      )}
    </PublicShell>
  );
}
