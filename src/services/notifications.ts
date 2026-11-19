import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { esc, sendEmail, type MailAttachment, type MailResult } from "@/lib/mail";
import { formatTnd } from "@/lib/money";
import { formatManualCode } from "@/lib/tokens";
import { digitalTicketPdf } from "@/lib/pdf";

const base = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString("en-GB", { timeZone: "Africa/Tunis", ...o });
const validHex = (c?: string | null) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#e1102a");

let logoCache: Buffer | null = null;
async function logo() {
  try { return (logoCache ??= await readFile(path.join(process.cwd(), "public/brand/onda-logo-email.png"))); } catch { return null; }
}

type T = Awaited<ReturnType<typeof loadTickets>>[number];
function loadTickets(ids: string[]) {
  return prisma.ticket.findMany({
    where: { id: { in: ids }, admissionStatus: { in: ["VALID", "CHECKED_IN"] } },
    orderBy: { serial: "asc" },
    include: { event: true, category: true, holder: { select: { fullName: true, email: true } }, purchaser: { select: { fullName: true, email: true } } },
  });
}

export interface EmailReport { to: string; status: MailResult["status"]; tickets: number; error?: string }

/**
 * Sends tickets by email after a sale, activation, complimentary issue, conversion or reissue:
 *  - the BUYER (purchaser) receives every ticket of the purchase in one email;
 *  - each ATTENDEE whose email differs from the buyer's receives their own ticket.
 * Every email carries the QR code, the manual entry code, an "open ticket" link and the PDF ticket.
 */
export async function emailTickets(ticketIds: string[]): Promise<EmailReport[]> {
  if (!ticketIds.length) return [];
  const tickets = await loadTickets(ticketIds);
  const byEmail = new Map<string, { name: string; tickets: T[]; isBuyer: boolean }>();
  const add = (email: string | undefined, name: string, tk: T, isBuyer: boolean) => {
    if (!email) return;
    const key = email.trim().toLowerCase();
    const cur = byEmail.get(key) ?? { name, tickets: [], isBuyer };
    if (!cur.tickets.includes(tk)) cur.tickets.push(tk);
    cur.isBuyer ||= isBuyer;
    if (isBuyer) cur.name = name;
    byEmail.set(key, cur);
  };
  for (const tk of tickets) {
    if (tk.purchaser) add(tk.purchaser.email, tk.purchaser.fullName, tk, true);
    if (tk.holder) add(tk.holder.email, tk.holder.fullName, tk, false);
  }

  const reports: EmailReport[] = [];
  for (const [to, r] of byEmail) {
    try {
      const msg = await ticketEmail(to, r.name, r.tickets, r.isBuyer && r.tickets.some((t) => t.holder && t.holder.email.toLowerCase() !== to));
      const res = await sendEmail(msg);
      reports.push({ to, status: res.status, tickets: r.tickets.length, error: res.error });
    } catch (e) {
      console.error("ticket email failed", to, e);
      reports.push({ to, status: "FAILED", tickets: r.tickets.length, error: "Could not build the email" });
    }
  }
  return reports;
}

async function ticketEmail(to: string, name: string, tickets: T[], othersAlsoNotified: boolean) {
  const ev = tickets[0].event;
  const accent = validHex(ev.themeColor);
  const title = ev.theme?.trim() || ev.name;
  const start = new Date(ev.startsAt);
  const when = `${fmt(start, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${fmt(start, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  const n = tickets.length;
  const subject = `${n === 1 ? "Your ONDA ticket" : `Your ${n} ONDA tickets`} — ${title} · ${fmt(start, { weekday: "short", day: "numeric", month: "short" })}`;

  const attachments: MailAttachment[] = [];
  const logoPng = await logo();
  if (logoPng) attachments.push({ filename: "onda.png", content: logoPng, contentType: "image/png", cid: "onda-logo" });

  const cards: string[] = [];
  const textParts: string[] = [];
  for (const t of tickets) {
    const cid = `qr-${t.id}`;
    attachments.push({ filename: `qr-${t.serial}.png`, content: await QRCode.toBuffer(t.qrToken, { errorCorrectionLevel: "M", margin: 2, width: 440, color: { dark: "#140b0d", light: "#ffffff" } }), contentType: "image/png", cid });
    const pdf = await digitalTicketPdf({ serial: t.serial, qrToken: t.qrToken, manualCode: t.manualCode, eventName: ev.name, theme: ev.theme, themeColor: ev.themeColor, venue: ev.venue, startsAt: ev.startsAt, endsAt: ev.endsAt, category: t.category.name, priceMillimes: t.priceMillimes, kind: t.kind, holderName: t.holder?.fullName });
    attachments.push({ filename: `ONDA-ticket-${t.serial}.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" });
    const url = `${base()}/t/${t.qrToken}`;
    const price = t.kind === "COMPLIMENTARY" ? "Complimentary" : formatTnd(t.priceMillimes ?? 0);
    const code = formatManualCode(t.manualCode);
    cards.push(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:18px;margin:0 0 18px 0;border:1px solid #eee9ea;">
        <tr><td style="padding:22px 24px 6px 24px;">
          <p style="margin:0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#6f6567;font-weight:700;">Ticket holder</p>
          <p style="margin:4px 0 0 0;font-size:20px;font-weight:800;color:#140b0d;">${esc(t.holder?.fullName ?? "")}</p>
          <p style="margin:6px 0 0 0;font-size:14px;color:#3d3537;">${esc(t.category.name)} · <b>${esc(price)}</b> · <span style="white-space:nowrap;">No. ${esc(t.serial)}</span></p>
        </td></tr>
        <tr><td align="center" style="padding:14px 24px 4px 24px;">
          <img src="cid:${cid}" width="220" height="220" alt="Ticket QR code" style="display:block;width:220px;height:220px;border:0;" />
        </td></tr>
        <tr><td align="center" style="padding:6px 24px 4px 24px;">
          <p style="margin:0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6f6567;font-weight:700;">No scan? Type this code</p>
          <p style="margin:8px 0 0 0;display:inline-block;padding:10px 18px;border-radius:12px;background:#fff0f2;font-family:'Courier New',Courier,monospace;font-size:22px;font-weight:700;letter-spacing:3px;color:#140b0d;">${esc(code)}</p>
        </td></tr>
        <tr><td align="center" style="padding:18px 24px 24px 24px;">
          <a href="${esc(url)}" style="display:inline-block;padding:14px 28px;border-radius:14px;background:${accent};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:1px;">OPEN MY TICKET</a>
        </td></tr>
      </table>`);
    textParts.push(`- ${t.holder?.fullName ?? ""} · ${t.category.name} · ${price} · No. ${t.serial}\n  Code: ${code}\n  Ticket: ${url}`);
  }

  const intro = n === 1
    ? (othersAlsoNotified ? "Here is the ticket you bought." : "Your ticket is confirmed.")
    : `Here ${n === 1 ? "is" : "are"} the ${n} tickets you bought.${othersAlsoNotified ? " Each attendee has also received their own ticket by email." : ""}`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f1f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1f1;"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="background:#0b0506;border-radius:22px 22px 0 0;padding:26px 26px 30px 26px;">
        ${logoPng ? `<img src="cid:onda-logo" width="150" alt="ONDA" style="display:block;width:150px;height:auto;border:0;" />` : `<p style="margin:0;font-size:28px;font-weight:800;color:#ff2944;">ONDA</p>`}
        <p style="margin:22px 0 0 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#b4a7aa;font-weight:700;">${ev.theme ? "This edition&#39;s theme" : "ONDA presents"}</p>
        <p style="margin:6px 0 0 0;font-size:32px;line-height:1.1;font-weight:800;color:#ffffff;">${esc(title)}</p>
        <p style="margin:14px 0 0 0;font-size:15px;color:#e2d8da;">${esc(when)}</p>
        <p style="margin:4px 0 0 0;font-size:15px;color:#e2d8da;">${esc(ev.venue)}</p>
        <div style="margin-top:18px;height:4px;width:72px;border-radius:4px;background:${accent};"></div>
      </td></tr>
      <tr><td style="background:#f8f6f6;padding:24px 18px 8px 18px;">
        <p style="margin:0 6px 18px 6px;font-size:16px;color:#140b0d;">Hello ${esc(name)},</p>
        <p style="margin:0 6px 20px 6px;font-size:15px;line-height:1.5;color:#3d3537;">${esc(intro)} Your PDF ticket${n > 1 ? "s are" : " is"} attached too.</p>
        ${cards.join("")}
      </td></tr>
      <tr><td style="background:#f8f6f6;border-radius:0 0 22px 22px;padding:4px 24px 26px 24px;">
        <p style="margin:0;font-size:14px;line-height:1.5;color:#3d3537;"><b>At the entrance:</b> show the QR code (or the code under it) and your national ID card. Each ticket admits one person, once.</p>
        <p style="margin:12px 0 0 0;font-size:12px;line-height:1.5;color:#6f6567;">Paid in cash to an authorized ONDA seller. Keep this email private: anyone with the QR code could use your ticket.</p>
      </td></tr>
      <tr><td align="center" style="padding:16px 8px;font-size:12px;color:#8f8689;">ONDA · ${esc(ev.venue)}</td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = `Hello ${name},\n\n${intro}\n\n${title} — ${when}\n${ev.venue}\n\n${textParts.join("\n\n")}\n\nAt the entrance: show the QR code (or the code) and your national ID card. Each ticket admits one person, once.\nYour PDF ticket${n > 1 ? "s are" : " is"} attached.\n\nONDA · ${ev.venue}`;
  return { to, subject, html, text, attachments };
}

export async function emailReservation(reservationId: string) {
  const r = await prisma.reservation.findUnique({ where: { id: reservationId }, include: { event: true, category: true, purchaser: true, attendees: true } });
  if (!r) return;
  const title = r.event.theme?.trim() || r.event.name;
  const link = `${base()}/reservations/${encodeURIComponent(r.code)}`;
  const expires = fmt(r.expiresAt, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false });
  await sendEmail({
    to: r.purchaser.email,
    subject: `Reservation received — ${title} (not a ticket yet)`,
    html: `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f4f1f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#140b0d;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;"><tr><td style="padding:26px;">
      <p style="margin:0;font-size:16px;">Hello ${esc(r.purchaser.fullName)},</p>
      <p style="margin:12px 0 0 0;font-size:15px;line-height:1.5;">Your free reservation for <b>${esc(title)}</b> at ${esc(r.event.venue)} (${r.attendees.length} attendee${r.attendees.length > 1 ? "s" : ""}, ${esc(r.category.name)}) is recorded.</p>
      <p style="margin:14px 0 0 0;padding:14px;border-radius:12px;background:#fff1e6;color:#a2501b;font-size:14px;line-height:1.5;"><b>This is not a ticket and does not guarantee entry.</b> Paid ticket holders come first. Pay in cash to an ONDA seller before ${esc(expires)} to receive your tickets by email.</p>
      <p style="margin:16px 0 0 0;font-size:14px;">Reservation code: <b style="font-family:'Courier New',monospace;">${esc(r.code)}</b></p>
      <p style="margin:18px 0 0 0;"><a href="${esc(link)}" style="display:inline-block;padding:12px 22px;border-radius:12px;background:#e1102a;color:#fff;font-weight:700;text-decoration:none;">View my reservation</a></p>
      </td></tr></table></body></html>`,
    text: `Hello ${r.purchaser.fullName},\n\nYour free reservation for ${title} at ${r.event.venue} (${r.attendees.length} attendee(s), ${r.category.name}) is recorded.\nThis is NOT a ticket and does not guarantee entry. Pay in cash to an ONDA seller before ${expires} to receive your tickets by email.\n\nReservation code: ${r.code}\n${link}`,
  }).catch((e) => console.error("reservation email failed", r.id, e));
}
