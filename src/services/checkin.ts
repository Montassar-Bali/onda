import { z } from "zod";
import { advisoryLock, prisma, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { cinDigest } from "@/lib/cin";
import { DomainError } from "@/lib/errors";
import { cinSchema, uuid } from "@/lib/validation";
import { requireEventAccess } from "./guards";
import { capacityLockKey, ticketRef } from "./sales";
import type { Actor } from "./types";

export type ScanResult =
  | "ADMITTED" | "DUPLICATE" | "UNSOLD" | "REVOKED" | "WRONG_EVENT" | "UNKNOWN" | "VENUE_FULL"
  | "RESERVATION_ADMITTED" | "RESERVATION_REFUSED";

export interface ScanResponse {
  result: ScanResult;
  admitted: boolean;
  message: string;
  ticket?: { serial: string; category: string; kind: string; holderName: string | null; checkedInAt: Date | null };
}

export const UNSOLD_MESSAGE = "UNSOLD TICKET — PAYMENT NOT RECORDED — ENTRY DENIED";

export const scanInput = z.object({ eventId: uuid, qrToken: z.string().min(10).max(200) });

/**
 * Atomic check-in. The ticket transition VALID → CHECKED_IN is conditional (only one scan can
 * win), and the venue counter only increments while below venue_capacity. Both happen in one
 * transaction: if the venue is full, the ticket stays VALID.
 */
export async function scanTicket(actor: Actor, raw: unknown): Promise<ScanResponse> {
  const d = scanInput.parse(raw);
  await requireEventAccess(actor, d.eventId);
  const tk = await prisma.ticket.findUnique({
    where: ticketRef(d.qrToken),
    include: { category: { select: { name: true } }, holder: { select: { fullName: true } } },
  });
  const log = (result: ScanResult, ticketId?: string) =>
    prisma.scanLog.create({ data: { eventId: d.eventId, ticketId: ticketId ?? null, scannerId: actor.id, result } });

  if (!tk) { await log("UNKNOWN"); return { result: "UNKNOWN", admitted: false, message: "UNKNOWN TICKET CODE — ENTRY DENIED" }; }
  const info = { serial: tk.serial, category: tk.category.name, kind: tk.kind, holderName: tk.holder?.fullName ?? null, checkedInAt: tk.checkedInAt };
  if (tk.eventId !== d.eventId) { await log("WRONG_EVENT", tk.id); return { result: "WRONG_EVENT", admitted: false, message: "TICKET IS FOR ANOTHER EVENT — ENTRY DENIED", ticket: info }; }
  if (tk.admissionStatus === "NOT_ELIGIBLE") { await log("UNSOLD", tk.id); return { result: "UNSOLD", admitted: false, message: UNSOLD_MESSAGE, ticket: info }; }
  if (tk.admissionStatus === "REVOKED") { await log("REVOKED", tk.id); return { result: "REVOKED", admitted: false, message: "TICKET REVOKED — ENTRY DENIED", ticket: info }; }
  if (tk.admissionStatus === "CHECKED_IN") {
    await log("DUPLICATE", tk.id);
    return { result: "DUPLICATE", admitted: false, message: `ALREADY USED at ${tk.checkedInAt?.toLocaleString("fr-TN", { timeZone: "Africa/Tunis" })} — ENTRY DENIED`, ticket: info };
  }

  try {
    const checkedInAt = await tx(async (t) => {
      const now = new Date();
      const u = await t.ticket.updateMany({ where: { id: tk.id, admissionStatus: "VALID" }, data: { admissionStatus: "CHECKED_IN", checkedInAt: now, checkedInById: actor.id } });
      if (u.count !== 1) throw new DomainError("DUPLICATE", "Already checked in");
      const n = await t.$executeRaw`UPDATE events SET checked_in_count = checked_in_count + 1 WHERE id = ${tk.eventId}::uuid AND checked_in_count < venue_capacity`;
      if (n !== 1) throw new DomainError("VENUE_FULL", "Venue at capacity");
      await t.ticketInventoryMovement.create({ data: { ticketId: tk.id, actorId: actor.id, action: "CHECKED_IN", fromAdmission: "VALID", toAdmission: "CHECKED_IN" } });
      await t.scanLog.create({ data: { eventId: d.eventId, ticketId: tk.id, scannerId: actor.id, result: "ADMITTED" } });
      return now;
    });
    return { result: "ADMITTED", admitted: true, message: tk.kind === "COMPLIMENTARY" ? "VALID — COMPLIMENTARY — ADMIT" : "VALID — ADMIT", ticket: { ...info, checkedInAt } };
  } catch (e) {
    if (e instanceof DomainError && (e.code === "DUPLICATE" || e.code === "VENUE_FULL")) {
      await log(e.code as ScanResult, tk.id);
      return { result: e.code as ScanResult, admitted: false, message: e.code === "DUPLICATE" ? "ALREADY USED — ENTRY DENIED" : "VENUE AT FULL CAPACITY — ENTRY DENIED", ticket: info };
    }
    throw e;
  }
}

export const reservationAdmitInput = z.object({ eventId: uuid, code: z.string().min(5), attendeeCin: cinSchema });

/**
 * Admission of an UNPAID reservation attendee — only if the event allows it, the identity
 * matches, and real capacity remains AFTER reserving room for every outstanding paid and
 * complimentary entitlement (paid holders keep priority). No paid ticket is created.
 */
export async function admitReservation(actor: Actor, raw: unknown): Promise<ScanResponse> {
  const d = reservationAdmitInput.parse(raw);
  await requireEventAccess(actor, d.eventId);
  const refuse = async (message: string) => {
    await prisma.scanLog.create({ data: { eventId: d.eventId, scannerId: actor.id, result: "RESERVATION_REFUSED" } });
    return { result: "RESERVATION_REFUSED" as const, admitted: false, message };
  };
  const r = await prisma.reservation.findUnique({ where: { code: d.code }, include: { attendees: { include: { identity: true } } } });
  if (!r || r.eventId !== d.eventId) return refuse("RESERVATION NOT FOUND FOR THIS EVENT");
  if (r.status !== "PENDING" || r.expiresAt < new Date()) return refuse(`RESERVATION ${r.status === "PENDING" ? "EXPIRED" : r.status} — NOT ADMISSIBLE`);
  const inv = await prisma.reservationInventory.findUnique({ where: { eventId: d.eventId } });
  if (!inv?.allowReservationAdmission) return refuse("THIS EVENT DOES NOT ADMIT UNPAID RESERVATIONS");
  const digest = cinDigest(d.attendeeCin);
  const attendee = r.attendees.find((a) => a.identity.cinHmac === digest);
  if (!attendee) return refuse("IDENTITY DOES NOT MATCH THE RESERVATION");
  if (attendee.admittedAt) return refuse("ATTENDEE ALREADY ADMITTED");

  return tx(async (t) => {
    await advisoryLock(t, capacityLockKey(d.eventId));
    const outstanding = await t.ticket.count({ where: { eventId: d.eventId, admissionStatus: "VALID" } });
    const n = await t.$executeRaw`
      UPDATE events SET checked_in_count = checked_in_count + 1, reservation_admit_count = reservation_admit_count + 1
      WHERE id = ${d.eventId}::uuid AND checked_in_count + 1 + ${outstanding} <= venue_capacity`;
    if (n !== 1) {
      await t.scanLog.create({ data: { eventId: d.eventId, scannerId: actor.id, result: "RESERVATION_REFUSED" } });
      return { result: "RESERVATION_REFUSED" as const, admitted: false, message: "NO CAPACITY LEFT FOR UNPAID RESERVATIONS (paid holders have priority) — ENTRY DENIED" };
    }
    const u = await t.reservationAttendee.updateMany({ where: { id: attendee.id, admittedAt: null }, data: { admittedAt: new Date(), admittedById: actor.id } });
    if (u.count !== 1) throw new DomainError("DUPLICATE", "Attendee already admitted", 409);
    await t.scanLog.create({ data: { eventId: d.eventId, scannerId: actor.id, result: "RESERVATION_ADMITTED" } });
    await audit(t, actor.id, "RESERVATION_ADMITTED", "reservation", r.id, { attendeeId: attendee.id }, actor.ip);
    return { result: "RESERVATION_ADMITTED" as const, admitted: true, message: `UNPAID RESERVATION — ADMITTED UNDER EVENT POLICY (${attendee.identity.fullName})` };
  });
}
