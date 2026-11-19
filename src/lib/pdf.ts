import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, degrees, type RGB,
  pushGraphicsState, popGraphicsState, moveTo, lineTo, appendBezierCurve, closePath, clip, endPath,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import { formatTnd } from "./money";
import { formatManualCode } from "./tokens";
import { woffToSfnt } from "./woff";

/**
 * ONDA e-ticket, in the logo's chrome red and black. One design for printed batches and digital tickets:
 *   body  — gradient in the edition's theme colour, the logo's liquid swooshes, sparkles, waves (ONDA = wave);
 *           ONDA logo, theme (as the title), date, time, venue with the Tropical Bar logo, category, price
 *   stub  — tear-off: vector QR (opaque token only), the 12-character manual code, serial, holder / activation note
 * No national ID is ever printed or encoded.
 */
export interface PdfTicket {
  serial: string; qrToken: string; manualCode: string;
  eventName: string; theme?: string | null; themeColor?: string | null; venue: string; startsAt: Date; endsAt?: Date | null;
  category: string; priceMillimes: number | null; kind: string; holderName?: string | null;
}

export const TICKET_W = 547;
export const TICKET_H = 250;
const BODY_W = 380;

// ───────────────────────────── palette ─────────────────────────────
const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const mixHex = (a: string, b: string, t: number) => {
  const p = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return "#" + [1, 3, 5].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, "0")).join("");
};
const mix = (a: string, b: string, t: number): RGB => {
  const p = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return rgb(p(a, 1) + (p(b, 1) - p(a, 1)) * t, p(a, 3) + (p(b, 3) - p(a, 3)) * t, p(a, 5) + (p(b, 5) - p(a, 5)) * t);
};
const C = {
  white: rgb(1, 1, 1), navy: hex("#140b0d"), muted: hex("#6f6567"), soft: hex("#ffeef0"), line: hex("#d8d0d2"),
  lilac: hex("#f0b9c1"), sun: "#ffc2ca", coral: "#e1102a", coralRgb: hex("#e1102a"), gold: hex("#ff8a99"),
  top: "#5c0a15", bottom: "#0b0506", red: hex("#ff2944"),
};

// ───────────────────────────── fonts ─────────────────────────────
interface Fonts { regular: PDFFont; bold: PDFFont; black: PDFFont; mono: PDFFont; custom: boolean; logo?: PDFImage; venueLogo?: PDFImage }
async function loadFonts(pdf: PDFDocument): Promise<Fonts> {
  const f = await loadFaces(pdf);
  try { f.logo = await pdf.embedPng(await readFile(path.join(process.cwd(), "public/brand/onda-logo-email.png"))); } catch { /* text fallback */ }
  try { f.venueLogo = await pdf.embedPng(await readFile(path.join(process.cwd(), "public/brand/tropical-bar.png"))); } catch { /* no venue logo */ }
  return f;
}
async function loadFaces(pdf: PDFDocument): Promise<Fonts> {
  const mono = await pdf.embedFont(StandardFonts.CourierBold);
  try {
    pdf.registerFontkit(fontkit);
    const dir = path.join(process.cwd(), "node_modules/@fontsource/plus-jakarta-sans/files");
    const [r, b, k] = await Promise.all(["400", "700", "800"].map(async (w) => woffToSfnt(await readFile(path.join(dir, `plus-jakarta-sans-latin-${w}-normal.woff`)))));
    return { regular: await pdf.embedFont(r, { subset: true }), bold: await pdf.embedFont(b, { subset: true }), black: await pdf.embedFont(k, { subset: true }), mono, custom: true };
  } catch {
    return { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold), black: await pdf.embedFont(StandardFonts.HelveticaBold), mono, custom: false };
  }
}
/** Standard fonts are WinAnsi-only; the embedded face covers Latin-1 and punctuation. */
const clean = (s: string, f: Fonts) => (f.custom ? s : s.normalize("NFKD").replace(/[^\x20-\x7E]/g, ""));

// ───────────────────────────── text helpers ─────────────────────────────
function trackedWidth(text: string, font: PDFFont, size: number, tracking: number) {
  return [...text].reduce((w, ch) => w + font.widthOfTextAtSize(ch, size) + tracking, 0) - tracking;
}
function drawTracked(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color: RGB, tracking = 0, opacity = 1) {
  if (!tracking) { page.drawText(text, { x, y, size, font, color, opacity }); return font.widthOfTextAtSize(text, size); }
  let cx = x;
  for (const ch of text) { page.drawText(ch, { x: cx, y, size, font, color, opacity }); cx += font.widthOfTextAtSize(ch, size) + tracking; }
  return cx - x - tracking;
}
function wrap(text: string, font: PDFFont, size: number, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxW) { cur = next; continue; }
    if (cur) lines.push(cur);
    cur = w;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && font.widthOfTextAtSize(last + "…", size) > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = last.trimEnd() + "…";
    return kept;
  }
  return lines;
}
function ellipsize(text: string, font: PDFFont, size: number, maxW: number) { return wrap(text, font, size, maxW, 1)[0] ?? ""; }

// ───────────────────────────── shape helpers ─────────────────────────────
const K = 0.5523;
function roundedRectOps(x: number, y: number, w: number, h: number, r: number) {
  return [
    moveTo(x + r, y), lineTo(x + w - r, y), appendBezierCurve(x + w - r + r * K, y, x + w, y + r - r * K, x + w, y + r),
    lineTo(x + w, y + h - r), appendBezierCurve(x + w, y + h - r + r * K, x + w - r + r * K, y + h, x + w - r, y + h),
    lineTo(x + r, y + h), appendBezierCurve(x + r - r * K, y + h, x, y + h - r + r * K, x, y + h - r),
    lineTo(x, y + r), appendBezierCurve(x, y + r - r * K, x + r - r * K, y, x + r, y), closePath(),
  ];
}
const roundedRectPath = (w: number, h: number, r: number) =>
  `M${r},0 H${w - r} Q${w},0 ${w},${r} V${h - r} Q${w},${h} ${w - r},${h} H${r} Q0,${h} 0,${h - r} V${r} Q0,0 ${r},0 Z`;


function drawQr(page: PDFPage, text: string, x: number, y: number, size: number, color: RGB) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size, cell = size / n;
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.modules.get(r, c)) { c++; continue; }
      const start = c;
      while (c < n && qr.modules.get(r, c)) c++;
      page.drawRectangle({ x: x + start * cell, y: y + size - (r + 1) * cell, width: (c - start) * cell + 0.35, height: cell + 0.35, color });
    }
  }
}

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString("en-GB", { timeZone: "Africa/Tunis", ...o });

// ───────────────────────────── the ticket ─────────────────────────────
function drawTicket(page: PDFPage, F: Fonts, t: PdfTicket, x0: number, y0: number, pageBg: RGB = C.white) {
  const W = TICKET_W, H = TICKET_H, top = y0 + H, sx = x0 + BODY_W, SW = W - BODY_W;
  const physical = t.kind === "PHYSICAL", comp = t.kind === "COMPLIMENTARY";

  // Everything inside the rounded ticket outline.
  page.pushOperators(pushGraphicsState(), ...roundedRectOps(x0, y0, W, H, 18), clip(), endPath());

  // this edition's colourway (ONDA red when no theme colour is set)
  const tc = t.themeColor && /^#[0-9a-fA-F]{6}$/.test(t.themeColor) ? t.themeColor : "#e1102a";
  const glow = hex(tc), deep = mix(tc, "#000000", 0.7), pale = mix(tc, "#ffffff", 0.7);
  const soft = (o = 0.68) => ({ color: C.white, opacity: o });

  // body gradient: the theme colour deepening into black
  const strips = 60, gTop = mixHex(tc, "#000000", 0.55);
  for (let i = 0; i < strips; i++) {
    page.drawRectangle({ x: x0, y: top - (i + 1) * (H / strips), width: BODY_W, height: H / strips + 0.6, color: mix(gTop, C.bottom, i / (strips - 1)) });
  }
  // stub
  page.drawRectangle({ x: sx, y: y0, width: SW, height: H, color: C.white });
  page.drawRectangle({ x: sx, y: top - 7, width: SW, height: 7, color: glow });

  // the logo's liquid swooshes, clipped to the body
  page.pushOperators(pushGraphicsState(), moveTo(x0, y0), lineTo(sx - 1, y0), lineTo(sx - 1, top), lineTo(x0, top), closePath(), clip(), endPath());
  const SW1 = "M6 168C96 52 268 10 394 44 284 30 138 74 6 168Z";
  const SW2 = "M60 150C150 70 270 40 360 50 270 50 160 86 60 150Z";
  const SW3 = "M394 44C330 92 220 150 110 182 214 158 322 108 394 44Z";
  const so = { x: x0 + BODY_W - 236, y: top - 6, scale: 0.68, rotate: degrees(-9) };
  page.drawSvgPath(SW1, { ...so, y: so.y - 3, color: deep });
  page.drawSvgPath(SW1, { ...so, color: glow });
  page.drawSvgPath(SW2, { ...so, color: pale, opacity: 0.55 });
  page.drawSvgPath(SW3, { ...so, color: glow, opacity: 0.75 });
  page.drawSvgPath(SW1, { x: x0 + BODY_W - 150, y: y0 + 118, scale: 0.36, rotate: degrees(10), color: pale, opacity: 0.35 });
  page.pushOperators(popGraphicsState());

  // waves along the bottom of the body (ONDA means wave)
  const wave = (amp: number, base: number, phase: number) => {
    let d = `M0,${base}`;
    for (let wx = 0; wx <= BODY_W + 40; wx += 40) d += ` Q${wx + 10 + phase},${base - amp} ${wx + 20 + phase},${base} T${wx + 40 + phase},${base}`;
    return d + ` L${BODY_W + 60},${H} L0,${H} Z`;
  };
  page.drawSvgPath(wave(6, H - 58, 0), { x: x0, y: top, color: C.white, opacity: 0.06 });
  page.drawSvgPath(wave(5, H - 44, 14), { x: x0, y: top, color: C.white, opacity: 0.07 });

  // brand row
  const pad = 26;
  if (F.logo) {
    const lh = 44, lw = lh * (F.logo.width / F.logo.height);
    page.drawImage(F.logo, { x: x0 + pad - 6, y: top - 12 - lh, width: lw, height: lh });
    drawTracked(page, "PRESENTS", x0 + pad + lw + 2, top - 46, 6.2, F.bold, C.white, 1.6, 0.7);
  } else {
    drawTracked(page, "ONDA", x0 + pad, top - 38, 16, F.black, C.red, 1.5);
    drawTracked(page, "PRESENTS", x0 + pad + 52, top - 38, 6.2, F.bold, C.white, 1.6, 0.7);
  }
  // the logo's four-point sparkles
  const SPARK = "M12 0C12.9 7.4 16.6 11.1 24 12 16.6 12.9 12.9 16.6 12 24 11.1 16.6 7.4 12.9 0 12 7.4 11.1 11.1 7.4 12 0Z";
  for (const [dx, dy, sc, op] of [[BODY_W - 58, 30, 0.7, 1], [BODY_W - 196, 30, 0.3, 0.7]] as const) {
    page.drawSvgPath(SPARK, { x: x0 + dx, y: top - dy, scale: sc, color: pale, opacity: op });
  }

  // title = this edition's theme; the edition name sits above it (skipped when it is just "ONDA")
  const title = clean((t.theme?.trim() || t.eventName), F);
  const label = t.theme?.trim() && t.eventName.trim().toLowerCase() !== "onda" ? clean(t.eventName, F).toUpperCase() : t.theme?.trim() ? "THIS EDITION" : null;
  let ty = top - 78;
  if (label) { drawTracked(page, ellipsize(label, F.bold, 8, 232), x0 + pad, ty, 8, F.bold, C.white, 1.4, 0.7); ty -= 26; } else ty -= 8;
  const maxTitleW = BODY_W - pad - 120;
  let size = 30, lines = wrap(title, F.black, size, maxTitleW, 2);
  while (size > 17 && lines.some((l) => F.black.widthOfTextAtSize(l.replace(/…$/, ""), size) > maxTitleW || l.endsWith("…"))) { size -= 1.5; lines = wrap(title, F.black, size, maxTitleW, 2); }
  for (const l of lines) { page.drawText(l, { x: x0 + pad, y: ty, size, font: F.black, color: C.white }); ty -= size * 1.04; }

  // date / time / venue (with the venue's logo)
  const infoY = y0 + 96;
  const start = new Date(t.startsAt);
  const vx = x0 + pad + 176, vLogo = F.venueLogo ? 24 : 0;
  const cols: [string, string[], number][] = [
    ["DATE", [fmt(start, { weekday: "short", day: "2-digit", month: "short" }), fmt(start, { year: "numeric" })], x0 + pad],
    ["TIME", [fmt(start, { hour: "2-digit", minute: "2-digit", hour12: false }), t.endsAt ? `until ${fmt(new Date(t.endsAt), { hour: "2-digit", minute: "2-digit", hour12: false })}` : "doors open"], x0 + pad + 98],
    ["VENUE", wrap(clean(t.venue, F), F.bold, 10.5, BODY_W - pad - 196 - vLogo, 2), vx + vLogo],
  ];
  if (F.venueLogo) page.drawImage(F.venueLogo, { x: vx - 2, y: infoY - 30, width: 22, height: 22 });
  for (const [lab, vals, cx2] of cols) {
    drawTracked(page, lab, cx2, infoY, 6.2, F.bold, C.white, 1.5, 0.65);
    vals.forEach((v, i) => page.drawText(v, { x: cx2, y: infoY - 14 - i * 12.5, size: i === 0 ? 10.5 : 9, font: i === 0 ? F.black : F.regular, ...(i === 0 ? soft(1) : soft(0.7)) }));
  }

  // category pill + price
  const cat = clean(t.category, F).toUpperCase();
  const catW = trackedWidth(cat, F.black, 8, 1) + 20;
  page.drawSvgPath(roundedRectPath(catW, 20, 10), { x: x0 + pad, y: y0 + 50, color: glow });
  drawTracked(page, cat, x0 + pad + 10, y0 + 37, 8, F.black, C.white, 1);
  drawTracked(page, "ADMIT ONE", x0 + pad + catW + 10, y0 + 37, 7, F.bold, C.white, 1.4, 0.7);
  if (comp || t.priceMillimes == null) {
    const s = "COMPLIMENTARY"; const w = trackedWidth(s, F.black, 11, 1.2);
    drawTracked(page, s, x0 + BODY_W - 24 - w, y0 + 36, 11, F.black, pale, 1.2);
  } else {
    const amount = formatTnd(t.priceMillimes, false), cur = "TND";
    const curW = F.bold.widthOfTextAtSize(cur, 9.5), amtW = F.black.widthOfTextAtSize(amount, 24);
    page.drawText(amount, { x: x0 + BODY_W - 24 - curW - 4 - amtW, y: y0 + 34, size: 24, font: F.black, color: C.white });
    page.drawText(cur, { x: x0 + BODY_W - 24 - curW, y: y0 + 35, size: 9.5, font: F.bold, color: C.white, opacity: 0.7 });
  }
  page.drawText(physical ? "Cash only · Single entry · Valid only once sold by an authorized seller · Keep intact" : "Cash only · Single entry · Present with your national ID card · Non-transferable",
    { x: x0 + pad, y: y0 + 13, size: 5.8, font: F.regular, color: C.white, opacity: 0.7 });
  // serial running up the perforation edge
  page.drawText(t.serial, { x: x0 + BODY_W - 9, y: y0 + 60, size: 6, font: F.bold, color: C.white, opacity: 0.55, rotate: degrees(90) });

  // ── stub ──
  const centre = (s: string, size: number, font: PDFFont, y: number, color: RGB, tracking = 0) =>
    drawTracked(page, s, sx + (SW - trackedWidth(s, font, size, tracking)) / 2, y, size, font, color, tracking);
  // Layout keeps the QR quiet zone at 4 modules (~15 pt) above and below.
  centre("SCAN AT THE GATE", 6.2, F.bold, top - 19, C.muted, 1.5);
  const q = 108;
  drawQr(page, t.qrToken, sx + (SW - q) / 2, top - 34 - q, q, C.navy);
  centre("NO SCAN? TYPE THIS CODE", 5.8, F.bold, top - 162, C.muted, 1.2);
  page.drawSvgPath(roundedRectPath(SW - 26, 25, 8), { x: sx + 13, y: top - 168, color: mix(tc, "#ffffff", 0.9) });
  centre(formatManualCode(t.manualCode), 12.5, F.mono, top - 185.5, C.navy, 0.4);
  centre(`No. ${t.serial}`, 7, F.regular, top - 204, C.muted);
  if (physical) {
    centre("NOT VALID UNTIL SOLD", 6.4, F.black, y0 + 30, C.coralRgb, 1.1);
    centre("by an authorized ONDA seller", 6.2, F.regular, y0 + 19, C.muted);
  } else {
    centre("HOLDER", 5.8, F.bold, y0 + 29, C.muted, 1.4);
    centre(ellipsize(clean(t.holderName ?? "—", F), F.black, 9.5, SW - 24), 9.5, F.black, y0 + 16, C.navy);
  }

  page.pushOperators(popGraphicsState());

  // outline = the cut line (the white stub would otherwise vanish on white paper)
  page.drawSvgPath(roundedRectPath(W, H, 18), { x: x0, y: top, borderColor: C.line, borderWidth: 0.8 });
  // perforation: notches cut into the outline, their edge drawn only inside the ticket, and a dashed tear line
  page.drawCircle({ x: sx, y: top, size: 11, color: pageBg });
  page.drawCircle({ x: sx, y: y0, size: 11, color: pageBg });
  page.pushOperators(pushGraphicsState(), moveTo(x0, y0), lineTo(x0 + W, y0), lineTo(x0 + W, top), lineTo(x0, top), closePath(), clip(), endPath());
  page.drawCircle({ x: sx, y: top, size: 11, borderColor: C.line, borderWidth: 0.8 });
  page.drawCircle({ x: sx, y: y0, size: 11, borderColor: C.line, borderWidth: 0.8 });
  page.pushOperators(popGraphicsState());
  page.drawLine({ start: { x: sx, y: y0 + 16 }, end: { x: sx, y: top - 16 }, thickness: 1.2, color: C.line, dashArray: [4, 4] });
}

// ───────────────────────────── documents ─────────────────────────────
/** Print sheet: three tickets per A4 page, ready to cut along the outline. */
export async function physicalSheetPdf(tickets: PdfTicket[], meta?: { label?: string }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`ONDA printed tickets${meta?.label ? ` · ${meta.label}` : ""}`);
  const F = await loadFonts(pdf);
  const PW = 595.28, PH = 841.89, perPage = 3, mx = (PW - TICKET_W) / 2, gap = (PH - 56 - perPage * TICKET_H) / (perPage - 1);
  const pages = Math.ceil(tickets.length / perPage);
  for (let i = 0; i < tickets.length; i++) {
    if (i % perPage === 0) {
      const p = pdf.addPage([PW, PH]);
      const pn = i / perPage + 1;
      p.drawText(`ONDA · ${clean(tickets[i].theme?.trim() || tickets[i].eventName, F)}${meta?.label ? ` · ${meta.label}` : ""} · Page ${pn}/${pages} · Generated ${fmt(new Date(), { dateStyle: "medium", timeStyle: "short" })}`,
        { x: mx, y: 12, size: 6.5, font: F.regular, color: C.muted });
    }
    const page = pdf.getPages()[pdf.getPageCount() - 1];
    const slot = i % perPage;
    drawTicket(page, F, tickets[i], mx, PH - 28 - TICKET_H - slot * (TICKET_H + gap));
  }
  return pdf.save();
}

/** Digital ticket PDF: the same e-ticket on its own page. */
export async function digitalTicketPdf(t: PdfTicket) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`ONDA ticket ${t.serial}`);
  const F = await loadFonts(pdf);
  const PW = TICKET_W + 48, PH = TICKET_H + 86;
  const page = pdf.addPage([PW, PH]);
  const bg = hex("#f8f6f6");
  page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: bg });
  drawTicket(page, F, t, 24, 56, bg);
  page.drawText("Show this QR code (or the code under it) and your national ID card at the gate.", { x: 24, y: 32, size: 8, font: F.bold, color: C.navy });
  page.drawText("Each ticket admits one person, once. A reissued ticket cancels the previous QR code and code.", { x: 24, y: 19, size: 7, font: F.regular, color: C.muted });
  return pdf.save();
}
