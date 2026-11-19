import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { PublicShell } from "@/components/PublicShell";
import { formatManualCode } from "@/lib/tokens";
import { Badge, Money, fmtTime } from "@/components/ui";
import { ThemePoster, chromeFor } from "@/components/ThemePoster";
import { VenueLogo } from "@/components/Venue";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Public ticket page. Shows holder name only — never CIN, phone or email. */
export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await prisma.ticket.findUnique({ where: { qrToken: token }, include: { event: true, category: true, holder: { select: { fullName: true } } } });
  if (!t) notFound();
  if (t.admissionStatus === "NOT_ELIGIBLE") {
    return <PublicShell><div className="mx-auto max-w-md rounded-lg bg-[#b42328] p-8 text-center text-white"><p className="text-[22px] font-bold leading-tight">Unsold ticket</p><p className="mt-2 text-[16px]">Payment not recorded. This ticket is not valid for entry.</p></div></PublicShell>;
  }
  const qr = await QRCode.toDataURL(t.qrToken, { margin: 1, width: 560, errorCorrectionLevel: "M", color: { dark: "#140b0d", light: "#ffffff" } });
  const d = new Date(t.event.startsAt);
  return (
    <PublicShell>
      <h1 className="sr-only">Your ticket for {t.event.name}</h1>
      <article className="ticket isolate mx-auto max-w-[420px]">
        <ThemePoster id={t.eventId} theme={t.event.theme} color={t.event.themeColor} name={t.event.name} size="sm" showName={false} className="rounded-t-[22px] text-white">
        <header className="relative px-6 pb-6 pt-5">
          <div className="flex items-center justify-between"><Logo height={30} className="logo-glow" /><span className="text-[13px] text-white/75">{t.kind === "COMPLIMENTARY" ? "Complimentary" : "Paid in cash"}</span></div>
          {t.event.theme && <p className="mt-10 text-[30px] font-extrabold leading-[1.05] tracking-[-0.02em]" style={chromeFor(t.eventId, t.event.themeColor)}>{t.event.theme}</p>}
          <p className={`${t.event.theme ? "mt-1" : "mt-10"} text-[20px] font-bold leading-tight`}>{t.event.name}</p>
          <p className="mt-2 text-[15px] text-white/85">{d.toLocaleDateString("fr-TN", { timeZone: "Africa/Tunis", weekday: "long", day: "numeric", month: "long" })} · {fmtTime(d)}</p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 text-[14px] font-semibold"><VenueLogo size={24} />{t.event.venue}</p>
        </header>
        </ThemePoster>
        <div className="flex justify-center px-6 py-7">
          {t.admissionStatus === "REVOKED"
            ? <div className="grid h-64 w-64 place-items-center bg-[var(--neg-bg)] text-center text-[18px] font-bold text-[var(--neg-ink)]">Ticket revoked</div>
            : <span className="rounded-2xl bg-white p-3"><img src={qr} alt="Ticket QR code to scan at the gate" className="h-60 w-60" /></span>}
        </div>
        {t.admissionStatus !== "REVOKED" && (
          <div className="-mt-3 px-6 pb-6 text-center">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">No scan? Type this code</p>
            <p className="num mt-2 inline-block rounded-xl bg-[var(--primary-soft)] px-4 py-2 font-mono text-[20px] font-bold tracking-[0.12em] text-[var(--primary-ink)]">{formatManualCode(t.manualCode)}</p>
          </div>
        )}
        <div className="ticket-perf" />
        <dl className="grid grid-cols-2 gap-y-4 px-6 py-6 text-[14px]">
          <div className="col-span-2"><dt className="text-zinc-500">Holder</dt><dd className="mt-0.5 text-[18px] font-semibold">{t.holder?.fullName}</dd></div>
          <div><dt className="text-zinc-500">Category</dt><dd className="mt-0.5 font-medium">{t.category.name}</dd></div>
          <div><dt className="text-zinc-500">Price</dt><dd className="mt-0.5 font-medium">{t.kind === "COMPLIMENTARY" ? "Complimentary" : <Money m={t.priceMillimes ?? 0} />}</dd></div>
          <div><dt className="text-zinc-500">Ticket number</dt><dd className="num mt-0.5 font-medium">{t.serial}</dd></div>
          <div><dt className="text-zinc-500">Status</dt><dd className="mt-1"><Badge>{t.admissionStatus}</Badge></dd></div>
        </dl>
        {t.admissionStatus !== "REVOKED" && <div className="px-6 pb-6"><a className="btn-cta w-full" href={`/api/public/tickets/${t.qrToken}/pdf`}>Download PDF</a></div>}
      </article>
      <p className="mx-auto mt-5 max-w-[420px] text-center text-[14px] text-zinc-600">Personal ticket, single entry. Bring your national ID card.</p>
    </PublicShell>
  );
}
