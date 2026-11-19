import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { formatManualCode, newManualCode, normalizeManualCode } from "@/lib/tokens";
import { sellDigitalTickets, activatePhysicalTicket, reissueTicket } from "@/services/sales";
import { generateBatch } from "@/services/physical";
import { scanTicket } from "@/services/checkin";
import { physicalSheetPdf, digitalTicketPdf } from "@/lib/pdf";
import { person, setupEvent } from "./helpers";

describe("manual entry code", () => {
  it("is 12 unambiguous characters, formatted XXXX-XXXX-XXXX, and normalizes typed input", () => {
    const codes = new Set(Array.from({ length: 2000 }, newManualCode));
    expect(codes.size).toBe(2000);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
    expect(formatManualCode("K7QM4XR2PH9T")).toBe("K7QM-4XR2-PH9T");
    expect(normalizeManualCode(" k7qm-4xr2 ph9t ")).toBe("K7QM4XR2PH9T");
    expect(normalizeManualCode("K7QM-4XR2-PH9")).toBeNull();
    expect(normalizeManualCode("O0O0-1111-IIII")).toBeNull();
  });

  it("checks a ticket in by typed code exactly like a QR scan", async () => {
    const { seller, event, cat } = await setupEvent();
    const { ticketIds } = await sellDigitalTickets(seller, { eventId: event.id, categoryId: cat.id, holders: [person()], cashCollected: true, expectedUnitPriceMillimes: 25000 });
    const tk = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketIds[0] } });
    const typed = formatManualCode(tk.manualCode).toLowerCase();
    expect((await scanTicket(seller, { eventId: event.id, qrToken: typed })).result).toBe("ADMITTED");
    expect((await scanTicket(seller, { eventId: event.id, qrToken: tk.qrToken })).result).toBe("DUPLICATE");
  });

  it("activates a printed ticket by typed code; an unsold printed code is still denied at the gate", async () => {
    const { leader, seller, event, cat } = await setupEvent();
    const batch = await generateBatch(leader, { eventId: event.id, categoryId: cat.id, quantity: 2, sellerId: seller.id });
    const [a, b] = await prisma.ticket.findMany({ where: { batchId: batch.id }, orderBy: { serial: "asc" } });
    expect((await scanTicket(seller, { eventId: event.id, qrToken: b.manualCode })).result).toBe("UNSOLD");
    await activatePhysicalTicket(seller, { qrToken: formatManualCode(a.manualCode), holder: person(), cashCollected: true, expectedUnitPriceMillimes: 25000 });
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: a.id } })).admissionStatus).toBe("VALID");
  });

  it("reissue rotates both the QR token and the manual code", async () => {
    const { leader, seller, event, cat } = await setupEvent();
    const p = person();
    const { ticketIds } = await sellDigitalTickets(seller, { eventId: event.id, categoryId: cat.id, holders: [p], cashCollected: true, expectedUnitPriceMillimes: 25000 });
    const before = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketIds[0] } });
    await reissueTicket(leader, before.id, p.cin, "lost phone");
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.manualCode).not.toBe(before.manualCode);
    expect(after.qrToken).not.toBe(before.qrToken);
    expect((await scanTicket(seller, { eventId: event.id, qrToken: before.manualCode })).result).toBe("UNKNOWN");
  });

  it("the database rejects malformed codes", async () => {
    const { leader, event, cat } = await setupEvent();
    const batch = await generateBatch(leader, { eventId: event.id, categoryId: cat.id, quantity: 1 });
    await expect(prisma.$executeRawUnsafe(`UPDATE tickets SET manual_code = 'ABC' WHERE batch_id = '${batch.id}'`)).rejects.toThrow();
  });

  it("renders printed and digital ticket PDFs", async () => {
    const t = { serial: "E98B-B001-0001", qrToken: "x".repeat(43), manualCode: newManualCode(), eventName: "Tropical Summer Festival", theme: "Nuit Bleue", venue: "Yasmine Hammamet Amphitheatre", startsAt: new Date(), endsAt: new Date(Date.now() + 3600e3), category: "General", priceMillimes: 25000, kind: "PHYSICAL" };
    const sheet = await physicalSheetPdf([t, t, t, t], { label: "Batch B001" });
    const digital = await digitalTicketPdf({ ...t, kind: "DIGITAL", holderName: "Amira Ben Salah" });
    expect(Buffer.from(sheet.slice(0, 5)).toString()).toBe("%PDF-");
    expect(Buffer.from(digital.slice(0, 5)).toString()).toBe("%PDF-");
    expect(sheet.length).toBeLessThan(400_000);
  });
});
