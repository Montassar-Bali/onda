/**
 * The complete REST API, in one table. All three interfaces (Admin, Team, Customer) use these
 * endpoints and the same services/database. Authorization is enforced again inside every
 * service function — the `auth` level here is only the first gate.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { maskCin } from "@/lib/cin";
import { digitalTicketPdf, physicalSheetPdf } from "@/lib/pdf";
import { notFound } from "@/lib/errors";
import { cinSchema, uuid } from "@/lib/validation";
import * as events from "@/services/events";
import * as sales from "@/services/sales";
import * as physical from "@/services/physical";
import * as cash from "@/services/cash";
import * as reservations from "@/services/reservations";
import * as checkin from "@/services/checkin";
import * as identity from "@/services/identity";
import * as users from "@/services/users";
import { eventReport } from "@/services/reports";
import type { Actor } from "@/services/types";

type Auth = "public" | "team" | "leader";
export interface Ctx { params: Record<string, string>; body: any; query: URLSearchParams; actor: Actor | null; ip: string | null }
type Handler = (c: Ctx & { actor: Actor }) => Promise<unknown>;

export interface Route { method: string; path: string; auth: Auth; handler: Handler } // for "public" routes actor may be null at runtime

const ids = z.object({ ticketIds: z.array(uuid).min(1) });
const reason = z.object({ reason: z.string().trim().min(3).max(500) });

const pdfResponse = (bytes: Uint8Array, filename: string) =>
  new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "no-store" } });

export const routes: Route[] = [
  // ───────── Customer (public) ─────────
  { method: "GET", path: "/public/events", auth: "public", handler: async () => {
    const list = await events.listPublishedEvents();
    return list.map((e) => ({
      id: e.id, name: e.name, description: e.description, venue: e.venue, startsAt: e.startsAt, endsAt: e.endsAt, currency: "TND",
      categories: e.categories.map((c) => ({ id: c.id, name: c.name, priceMillimes: c.priceMillimes })),
      reservations: e.reservationInventory?.enabled ? { opensAt: e.reservationInventory.opensAt, closesAt: e.reservationInventory.closesAt, maxPerReservation: e.reservationInventory.maxTicketsPerReservation } : null,
    }));
  } },
  { method: "POST", path: "/public/reservations", auth: "public", handler: (c) => reservations.createReservation(c.body, c.ip) },
  { method: "GET", path: "/public/reservations/:code", auth: "public", handler: async (c) => {
    const r = await reservations.publicReservationStatus(c.params.code);
    if (!r) throw notFound();
    return { code: r.code, status: r.status, expiresAt: r.expiresAt, attendees: r._count.attendees, event: r.event, category: r.category, isPaidTicket: false };
  } },
  { method: "POST", path: "/public/reservations/:code/cancel", auth: "public", handler: async (c) => {
    await reservations.cancelReservationByCustomer(c.params.code, String(c.body?.purchaserCin ?? ""), c.ip);
    return { ok: true };
  } },
  { method: "GET", path: "/public/tickets/:token/pdf", auth: "public", handler: async (c) => {
    const t = await prisma.ticket.findUnique({ where: { qrToken: c.params.token }, include: { event: true, category: true, holder: { select: { fullName: true } } } });
    if (!t || !["VALID", "CHECKED_IN"].includes(t.admissionStatus)) throw notFound("Ticket not found");
    const bytes = await digitalTicketPdf({ serial: t.serial, qrToken: t.qrToken, manualCode: t.manualCode, eventName: t.event.name, theme: t.event.theme, themeColor: t.event.themeColor, venue: t.event.venue, startsAt: t.event.startsAt, endsAt: t.event.endsAt, category: t.category.name, priceMillimes: t.priceMillimes, kind: t.kind, holderName: t.holder?.fullName });
    return pdfResponse(bytes, `ticket-${t.serial}.pdf`);
  } },

  // ───────── Team (sellers / scanners) ─────────
  { method: "POST", path: "/team/sales", auth: "team", handler: (c) => sales.sellDigitalTickets(c.actor, c.body) },
  { method: "GET", path: "/team/physical/preview", auth: "team", handler: (c) => sales.previewPhysicalTicket(c.actor, c.query.get("token") ?? "") },
  { method: "POST", path: "/team/physical/activate", auth: "team", handler: (c) => sales.activatePhysicalTicket(c.actor, c.body) },
  { method: "POST", path: "/team/physical/return", auth: "team", handler: (c) => { const d = ids.extend({ note: z.string().max(500).optional() }).parse(c.body); return physical.returnTickets(c.actor, d.ticketIds, d.note); } },
  { method: "POST", path: "/team/checkin", auth: "team", handler: (c) => checkin.scanTicket(c.actor, c.body) },
  { method: "POST", path: "/team/reservations/admit", auth: "team", handler: (c) => checkin.admitReservation(c.actor, c.body) },
  { method: "GET", path: "/team/reservations/:code", auth: "team", handler: async (c) => {
    const r = await reservations.lookupReservation(c.actor, c.params.code);
    return {
      code: r.code, status: r.status, expiresAt: r.expiresAt, eventId: r.eventId, isPaidTicket: false,
      category: { name: r.category.name, priceMillimes: r.category.priceMillimes },
      purchaser: { fullName: r.purchaser.fullName, cin: maskCin(r.purchaser.cinLast3) },
      attendees: r.attendees.map((a) => ({ fullName: a.identity.fullName, cin: maskCin(a.identity.cinLast3), admittedAt: a.admittedAt, ticketSerial: a.ticket?.serial ?? null })),
      allowReservationAdmission: r.event.reservationInventory?.allowReservationAdmission ?? false,
    };
  } },
  { method: "POST", path: "/team/reservations/convert", auth: "team", handler: (c) => reservations.convertReservation(c.actor, c.body) },
  { method: "POST", path: "/team/reservations/:code/cancel", auth: "team", handler: async (c) => { await reservations.cancelReservationByTeam(c.actor, c.params.code, String(c.body?.reason ?? "")); return { ok: true }; } },
  { method: "POST", path: "/team/cash/handovers", auth: "team", handler: (c) => cash.submitHandover(c.actor, c.body) },
  { method: "POST", path: "/team/cash/handovers/:id/cancel", auth: "team", handler: async (c) => { await cash.cancelHandover(c.actor, c.params.id); return { ok: true }; } },
  { method: "POST", path: "/team/cash/discrepancies/:id/explain", auth: "team", handler: async (c) => { await cash.explainDiscrepancy(c.actor, c.params.id, String(c.body?.explanation ?? "")); return { ok: true }; } },

  // ───────── Admin (Team Leader) ─────────
  { method: "POST", path: "/admin/events", auth: "leader", handler: (c) => events.createEvent(c.actor, c.body) },
  { method: "PUT", path: "/admin/events/:id", auth: "leader", handler: (c) => events.updateEvent(c.actor, c.params.id, c.body) },
  { method: "POST", path: "/admin/events/:id/status", auth: "leader", handler: (c) => events.setEventStatus(c.actor, c.params.id, z.enum(["PUBLISHED", "CLOSED", "CANCELLED"]).parse(c.body?.status)) },
  { method: "POST", path: "/admin/events/:id/categories", auth: "leader", handler: (c) => events.upsertCategory(c.actor, c.params.id, c.body) },
  { method: "PUT", path: "/admin/events/:id/categories/:cid", auth: "leader", handler: (c) => events.upsertCategory(c.actor, c.params.id, c.body, c.params.cid) },
  { method: "PUT", path: "/admin/events/:id/sellers", auth: "leader", handler: async (c) => { await events.setEventSellers(c.actor, c.params.id, z.array(uuid).parse(c.body?.userIds)); return { ok: true }; } },
  { method: "PUT", path: "/admin/events/:id/reservations", auth: "leader", handler: (c) => events.configureReservations(c.actor, c.params.id, c.body) },
  { method: "GET", path: "/admin/events/:id/report", auth: "leader", handler: (c) => eventReport(c.params.id) },
  { method: "POST", path: "/admin/batches", auth: "leader", handler: (c) => physical.generateBatch(c.actor, c.body) },
  { method: "GET", path: "/admin/batches/:id/pdf", auth: "leader", handler: async (c) => {
    const batch = await prisma.physicalTicketBatch.findUnique({ where: { id: c.params.id }, include: { event: true, category: true, tickets: { where: { inventoryStatus: { in: ["AVAILABLE", "ASSIGNED"] } }, orderBy: { serial: "asc" } } } });
    if (!batch) throw notFound();
    await physical.markBatchPrinted(c.actor, batch.id);
    const bytes = await physicalSheetPdf(batch.tickets.map((t) => ({ serial: t.serial, qrToken: t.qrToken, manualCode: t.manualCode, eventName: batch.event.name, theme: batch.event.theme, themeColor: batch.event.themeColor, venue: batch.event.venue, startsAt: batch.event.startsAt, endsAt: batch.event.endsAt, category: batch.category.name, priceMillimes: batch.category.priceMillimes, kind: "PHYSICAL" })), { label: `Batch B${String(batch.number).padStart(3, "0")}` });
    return pdfResponse(bytes, `batch-${batch.number}.pdf`);
  } },
  { method: "POST", path: "/admin/tickets/assign", auth: "leader", handler: (c) => physical.assignTickets(c.actor, c.body) },
  { method: "POST", path: "/admin/tickets/transfer", auth: "leader", handler: (c) => physical.transferTickets(c.actor, c.body) },
  { method: "POST", path: "/admin/tickets/void", auth: "leader", handler: (c) => { const d = ids.merge(reason).parse(c.body); return physical.voidUnsold(c.actor, d.ticketIds, d.reason); } },
  { method: "POST", path: "/admin/tickets/review-returned", auth: "leader", handler: (c) => { const d = ids.merge(reason).extend({ decision: z.enum(["RESTOCK", "VOID"]) }).parse(c.body); return physical.reviewReturned(c.actor, d.ticketIds, d.decision, d.reason); } },
  { method: "POST", path: "/admin/tickets/:id/reverse", auth: "leader", handler: async (c) => { await sales.reverseSale(c.actor, c.params.id, reason.parse(c.body).reason); return { ok: true }; } },
  { method: "POST", path: "/admin/tickets/:id/revoke", auth: "leader", handler: async (c) => { await sales.revokeComplimentary(c.actor, c.params.id, reason.parse(c.body).reason); return { ok: true }; } },
  { method: "POST", path: "/admin/tickets/:id/reissue", auth: "leader", handler: (c) => { const d = reason.extend({ cin: cinSchema }).parse(c.body); return sales.reissueTicket(c.actor, c.params.id, d.cin, d.reason); } },
  { method: "POST", path: "/admin/tickets/:id/resend-email", auth: "leader", handler: (c) => sales.resendTicketEmail(c.actor, c.params.id) },
  { method: "POST", path: "/admin/complimentary", auth: "leader", handler: (c) => sales.issueComplimentary(c.actor, c.body) },
  { method: "POST", path: "/admin/cash/reconcile", auth: "leader", handler: (c) => cash.reconcile(c.actor, c.body) },
  { method: "GET", path: "/admin/cash/accounts/:id/verify", auth: "leader", handler: (c) => cash.reconstructAccount(c.params.id) },
  { method: "POST", path: "/admin/cash/discrepancies/:id/require-explanation", auth: "leader", handler: async (c) => { await cash.requireExplanation(c.actor, c.params.id); return { ok: true }; } },
  { method: "POST", path: "/admin/cash/discrepancies/:id/resolve", auth: "leader", handler: async (c) => { await cash.resolveDiscrepancy(c.actor, c.params.id, String(c.body?.note ?? "")); return { ok: true }; } },
  { method: "POST", path: "/admin/users", auth: "leader", handler: (c) => users.createUser(c.actor, c.body) },
  { method: "PATCH", path: "/admin/users/:id", auth: "leader", handler: async (c) => { await users.setUserActive(c.actor, c.params.id, z.boolean().parse(c.body?.active)); return { ok: true }; } },
  { method: "POST", path: "/admin/sales-points", auth: "leader", handler: (c) => users.createSalesPoint(c.actor, c.body) },
  { method: "PUT", path: "/admin/sales-points/:id/members", auth: "leader", handler: async (c) => { await users.setSalesPointMembers(c.actor, c.params.id, z.array(uuid).parse(c.body?.userIds)); return { ok: true }; } },
  { method: "POST", path: "/admin/identities/lookup", auth: "leader", handler: async (c) => {
    const d = reason.extend({ cin: cinSchema }).parse(c.body);
    const r = await identity.lookupByCin(c.actor, d.cin, d.reason);
    return r ? { id: r.id, fullName: r.fullName, phone: r.phone, email: r.email, cin: maskCin(r.cinLast3) } : null;
  } },
  { method: "POST", path: "/admin/identities/:id/reveal", auth: "leader", handler: async (c) => ({ cin: await identity.revealCin(c.actor, c.params.id, reason.parse(c.body).reason) }) },
];

export function matchRoute(method: string, path: string): { route: Route; params: Record<string, string> } | null {
  const parts = path.split("/").filter(Boolean);
  for (const route of routes) {
    if (route.method !== method) continue;
    const rp = route.path.split("/").filter(Boolean);
    if (rp.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(":")) params[rp[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (rp[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}

