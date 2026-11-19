import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sellDigitalTickets, activatePhysicalTicket, issueComplimentary, reverseSale } from "@/services/sales";
import { generateBatch } from "@/services/physical";
import { scanTicket, UNSOLD_MESSAGE } from "@/services/checkin";
import { mkUser, person, setupEvent } from "./helpers";

const sale = (eventId: string, categoryId: string, holders = [person()], price = 25000) =>
  ({ eventId, categoryId, holders, cashCollected: true as const, expectedUnitPriceMillimes: price });

describe("cash-only digital sale", () => {
  it("creates SOLD / CASH_REPORTED_COLLECTED / VALID ticket, cash record and seller liability atomically", async () => {
    const { seller, event, cat } = await setupEvent();
    const r = await sellDigitalTickets(seller, sale(event.id, cat.id, [person(), person()]));
    expect(r.totalMillimes).toBe(50000);
    const tickets = await prisma.ticket.findMany({ where: { id: { in: r.ticketIds } } });
    for (const t of tickets) {
      expect([t.inventoryStatus, t.paymentStatus, t.admissionStatus]).toEqual(["SOLD", "CASH_REPORTED_COLLECTED", "VALID"]);
      expect(t.priceMillimes).toBe(25000);
      expect(t.soldById).toBe(seller.id);
      expect(t.qrToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
    const cash = await prisma.cashTransaction.findMany({ where: { ticketId: { in: r.ticketIds } } });
    expect(cash).toHaveLength(2);
    expect(cash.every((c) => c.reportedById === seller.id && c.amountMillimes === 25000)).toBe(true);
    const acc = await prisma.sellerCashAccount.findUniqueOrThrow({ where: { sellerId_eventId: { sellerId: seller.id, eventId: event.id } } });
    expect(acc.expectedMillimes).toBe(50000);
    const ev = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(ev.paidSoldCount).toBe(2);
  });

  it("requires explicit cash confirmation and official price; seller cannot alter price", async () => {
    const { seller, event, cat } = await setupEvent();
    await expect(sellDigitalTickets(seller, { ...sale(event.id, cat.id), cashCollected: false })).rejects.toThrow();
    await expect(sellDigitalTickets(seller, sale(event.id, cat.id, [person()], 1000))).rejects.toMatchObject({ code: "PRICE_CHANGED" });
  });

  it("rolls back everything on failure (sold out mid-transaction)", async () => {
    const { seller, event, cat } = await setupEvent({ venue: 10, paid: 1, comp: 0 });
    await expect(sellDigitalTickets(seller, sale(event.id, cat.id, [person(), person()]))).rejects.toMatchObject({ code: "SOLD_OUT" });
    expect(await prisma.ticket.count({ where: { eventId: event.id } })).toBe(0);
    expect(await prisma.cashTransaction.count({ where: { eventId: event.id } })).toBe(0);
    expect(await prisma.customerIdentityRecord.count({ where: { ticketsHeld: { some: { eventId: event.id } } } })).toBe(0);
  });

  it("never oversells under concurrency", async () => {
    const { seller, event, cat } = await setupEvent({ venue: 10, paid: 5, comp: 0 });
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => sellDigitalTickets(seller, sale(event.id, cat.id))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).paidSoldCount).toBe(5);
  });

  it("requires every attendee's identity and enforces per-identity limit within an event only", async () => {
    const { seller, event, cat, leader } = await setupEvent({ maxPerId: 2 });
    await expect(sellDigitalTickets(seller, sale(event.id, cat.id, [{ ...person(), cin: "" }]))).rejects.toThrow();
    const p = person();
    await sellDigitalTickets(seller, sale(event.id, cat.id, [p]));
    await sellDigitalTickets(seller, sale(event.id, cat.id, [p]));
    await expect(sellDigitalTickets(seller, sale(event.id, cat.id, [p]))).rejects.toMatchObject({ code: "IDENTITY_LIMIT" });
    // Same person may attend another event
    const other = await setupEvent();
    await expect(sellDigitalTickets(other.seller, sale(other.event.id, other.cat.id, [p]))).resolves.toBeTruthy();
    void leader;
  });

  it("purchaser can differ from holders", async () => {
    const { seller, event, cat } = await setupEvent();
    const buyer = person("Buyer Person");
    const r = await sellDigitalTickets(seller, { ...sale(event.id, cat.id, [person("Amira Ben Ali"), person("Bilel Trabelsi")]), purchaser: buyer });
    const tks = await prisma.ticket.findMany({ where: { id: { in: r.ticketIds } }, include: { purchaser: true, holder: true } });
    expect(tks.every((t) => t.purchaser?.fullName === "Buyer Person")).toBe(true);
    expect(tks.map((t) => t.holder?.fullName).sort()).toEqual(["Amira Ben Ali", "Bilel Trabelsi"]);
  });

  it("rejects sellers not assigned to the event", async () => {
    const { event, cat } = await setupEvent();
    const stranger = await mkUser("TEAM_MEMBER");
    await expect(sellDigitalTickets(stranger, sale(event.id, cat.id))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("stores no plaintext CIN anywhere in the database", async () => {
    const { seller, event, cat } = await setupEvent();
    const p = person();
    await sellDigitalTickets(seller, sale(event.id, cat.id, [p]));
    const hits = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`
      SELECT (SELECT count(*) FROM audit_logs WHERE data::text LIKE '%${p.cin}%')
           + (SELECT count(*) FROM customer_identity_records WHERE full_name LIKE '%${p.cin}%' OR email LIKE '%${p.cin}%' AND email <> '${p.email}')
           + (SELECT count(*) FROM email_outbox WHERE html LIKE '%${p.cin}%')
           + (SELECT count(*) FROM tickets WHERE qr_token LIKE '%${p.cin}%') AS n`);
    expect(Number(hits[0].n)).toBe(0);
  });
});

describe("physical tickets", () => {
  it("rejects batches over 200", async () => {
    const { leader, event, cat } = await setupEvent();
    await expect(generateBatch(leader, { eventId: event.id, categoryId: cat.id, quantity: 201 })).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(`INSERT INTO physical_ticket_batches (id, event_id, category_id, number, quantity, created_by_id) VALUES (gen_random_uuid(), '${event.id}', '${cat.id}', 99, 201, '${leader.id}')`)).rejects.toThrow();
  });

  it("only Team Leader generates batches", async () => {
    const { seller, event, cat } = await setupEvent();
    await expect(generateBatch(seller, { eventId: event.id, categoryId: cat.id, quantity: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("unsold printed QR is denied at the gate; activation makes it valid; double activation impossible", async () => {
    const { leader, seller, event, cat } = await setupEvent();
    const batch = await generateBatch(leader, { eventId: event.id, categoryId: cat.id, quantity: 3, sellerId: seller.id });
    const [tk] = await prisma.ticket.findMany({ where: { batchId: batch.id }, orderBy: { serial: "asc" } });
    expect([tk.inventoryStatus, tk.paymentStatus, tk.admissionStatus]).toEqual(["ASSIGNED", "NOT_COLLECTED", "NOT_ELIGIBLE"]);

    const scan1 = await scanTicket(leader, { eventId: event.id, qrToken: tk.qrToken });
    expect(scan1.admitted).toBe(false);
    expect(scan1.message).toBe(UNSOLD_MESSAGE);

    const seller2 = await mkUser("TEAM_MEMBER");
    await prisma.eventSeller.create({ data: { eventId: event.id, userId: seller2.id } });
    const input = (h = person()) => ({ qrToken: tk.qrToken, holder: h, cashCollected: true as const, expectedUnitPriceMillimes: 25000 });
    // Not assigned to seller2
    await expect(activatePhysicalTicket(seller2, input())).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Race: same seller activates twice concurrently → exactly one succeeds
    const res = await Promise.allSettled([activatePhysicalTicket(seller, input()), activatePhysicalTicket(seller, input())]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.cashTransaction.count({ where: { ticketId: tk.id } })).toBe(1);

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: tk.id } });
    expect([after.inventoryStatus, after.paymentStatus, after.admissionStatus]).toEqual(["SOLD", "CASH_REPORTED_COLLECTED", "VALID"]);
    expect(after.soldById).toBe(seller.id);

    const scan2 = await scanTicket(leader, { eventId: event.id, qrToken: tk.qrToken });
    expect(scan2.result).toBe("ADMITTED");
    const scan3 = await scanTicket(leader, { eventId: event.id, qrToken: tk.qrToken });
    expect(scan3.result).toBe("DUPLICATE");
  });

  it("database refuses to make an unsold physical ticket VALID even via raw SQL", async () => {
    const { leader, event, cat } = await setupEvent();
    const batch = await generateBatch(leader, { eventId: event.id, categoryId: cat.id, quantity: 1 });
    await expect(prisma.$executeRawUnsafe(`UPDATE tickets SET admission_status = 'VALID' WHERE batch_id = '${batch.id}'`)).rejects.toThrow();
  });
});

describe("complimentary & reversal", () => {
  it("comp tickets need a reason, count against allocation, carry zero revenue", async () => {
    const { leader, seller, event, cat } = await setupEvent({ venue: 10, paid: 5, comp: 1 });
    await expect(issueComplimentary(seller, { eventId: event.id, categoryId: cat.id, holder: person(), reason: "Press pass" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(issueComplimentary(leader, { eventId: event.id, categoryId: cat.id, holder: person(), reason: "" })).rejects.toThrow();
    const r = await issueComplimentary(leader, { eventId: event.id, categoryId: cat.id, holder: person(), reason: "Press pass" });
    const tk = await prisma.ticket.findUniqueOrThrow({ where: { id: r.ticketId } });
    expect([tk.kind, tk.admissionStatus, tk.paymentStatus, tk.priceMillimes, tk.issuedById]).toEqual(["COMPLIMENTARY", "VALID", "NOT_COLLECTED", 0, leader.id]);
    await expect(issueComplimentary(leader, { eventId: event.id, categoryId: cat.id, holder: person(), reason: "Second" })).rejects.toMatchObject({ code: "COMP_ALLOCATION_EXHAUSTED" });
  });

  it("reversal reduces seller liability via a negative ledger entry and revokes the ticket", async () => {
    const { leader, seller, event, cat } = await setupEvent();
    const { ticketIds } = await sellDigitalTickets(seller, sale(event.id, cat.id));
    await expect(reverseSale(seller, ticketIds[0], "customer refund")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await reverseSale(leader, ticketIds[0], "customer refund");
    const tk = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketIds[0] } });
    expect([tk.inventoryStatus, tk.paymentStatus, tk.admissionStatus]).toEqual(["VOID", "REVERSED", "REVOKED"]);
    const acc = await prisma.sellerCashAccount.findFirstOrThrow({ where: { sellerId: seller.id, eventId: event.id } });
    expect(acc.expectedMillimes).toBe(0);
    expect(await prisma.cashTransaction.count({ where: { ticketId: tk.id } })).toBe(2);
  });
});
