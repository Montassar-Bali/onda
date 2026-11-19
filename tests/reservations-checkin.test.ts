import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sellDigitalTickets, issueComplimentary } from "@/services/sales";
import { createReservation, convertReservation, cancelReservationByCustomer, expireDueReservations } from "@/services/reservations";
import { admitReservation, scanTicket } from "@/services/checkin";
import { eventReport } from "@/services/reports";
import { enableReservations, person, setupEvent } from "./helpers";

const reserve = (eventId: string, categoryId: string, attendees = [person()], purchaser = attendees[0]) =>
  createReservation({ eventId, categoryId, purchaser, attendees, acknowledgeNotATicket: true });

describe("reservations — separate inventory", () => {
  it("spec §7 example: reservations never reduce paid inventory or revenue", async () => {
    const { leader, seller, event, cat } = await setupEvent({ venue: 500, paid: 400, comp: 20 });
    await enableReservations(leader, event.id, 200, false, 10);
    for (let i = 0; i < 15; i++) await reserve(event.id, cat.id, Array.from({ length: 10 }, () => person())); // 150 attendees
    for (let i = 0; i < 3; i++) await sellDigitalTickets(seller, { eventId: event.id, categoryId: cat.id, holders: Array.from({ length: 20 }, () => person()), cashCollected: true, expectedUnitPriceMillimes: 25000 }); // 60 sold

    const rep = await eventReport(event.id);
    expect(rep.paid.ticketsSold).toBe(60);
    expect(rep.paid.paidRemaining).toBe(340);
    expect(rep.paid.grossSalesMillimes).toBe(60 * 25000);
    expect(rep.reservations.pendingAttendees).toBe(150);
    expect(rep.reservations.total).toBe(15);
    expect(rep.event.venueCapacity).toBe(500);
    expect(await prisma.ticket.count({ where: { eventId: event.id } })).toBe(60); // no tickets for reservations
  });

  it("enforces quota, per-reservation max, window, identity-required, one pending per identity", async () => {
    const { leader, event, cat } = await setupEvent();
    await expect(reserve(event.id, cat.id)).rejects.toMatchObject({ code: "RESERVATIONS_DISABLED" });
    await enableReservations(leader, event.id, 3, false, 2);
    await expect(reserve(event.id, cat.id, [person(), person(), person()])).rejects.toMatchObject({ code: "TOO_MANY_ATTENDEES" });
    const p = person();
    await reserve(event.id, cat.id, [p, person()]);
    await expect(reserve(event.id, cat.id, [p])).rejects.toMatchObject({ code: "ALREADY_RESERVED" });
    await expect(reserve(event.id, cat.id, [person(), person()])).rejects.toMatchObject({ code: "RESERVATION_QUOTA_FULL" });
    await expect(createReservation({ eventId: event.id, categoryId: cat.id, purchaser: person(), attendees: [person()] })).rejects.toThrow();
  });

  it("unpaid reservation code cannot be checked in as a ticket; conversion is an explicit cash sale", async () => {
    const { leader, seller, event, cat } = await setupEvent();
    await enableReservations(leader, event.id, 10);
    const buyer = person();
    const { code } = await reserve(event.id, cat.id, [buyer, person()]);
    const scan = await scanTicket(seller, { eventId: event.id, qrToken: code });
    expect(scan.admitted).toBe(false);

    await expect(convertReservation(seller, { code, purchaserCin: "99999999", cashCollected: true, expectedUnitPriceMillimes: 25000 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const conv = await convertReservation(seller, { code, purchaserCin: buyer.cin, cashCollected: true, expectedUnitPriceMillimes: 25000 });
    expect(conv.ticketIds).toHaveLength(2);
    expect(conv.totalMillimes).toBe(50000);
    const r = await prisma.reservation.findUniqueOrThrow({ where: { code } });
    expect(r.status).toBe("CONVERTED");
    expect((await prisma.reservationInventory.findUniqueOrThrow({ where: { eventId: event.id } })).pendingAttendees).toBe(0);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).paidSoldCount).toBe(2);
  });

  it("customer cancel requires purchaser CIN; expiry releases quota", async () => {
    const { leader, event, cat } = await setupEvent();
    await enableReservations(leader, event.id, 10);
    const p = person();
    const { code } = await reserve(event.id, cat.id, [p]);
    await expect(cancelReservationByCustomer(code, "11111111")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await cancelReservationByCustomer(code, p.cin);
    const { code: c2 } = await reserve(event.id, cat.id, [person()]);
    await prisma.reservation.update({ where: { code: c2 }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await expireDueReservations()).toBeGreaterThanOrEqual(1);
    expect((await prisma.reservationInventory.findUniqueOrThrow({ where: { eventId: event.id } })).pendingAttendees).toBe(0);
  });
});

describe("check-in and venue capacity", () => {
  it("reservation admission requires policy, identity match and capacity after paid entitlements", async () => {
    // venue 3: 2 paid sold (not yet arrived) → only 1 place for unpaid reservations
    const { leader, seller, event, cat } = await setupEvent({ venue: 3, paid: 2, comp: 1 });
    await enableReservations(leader, event.id, 5, false);
    const a = person(), b = person();
    const { code } = await reserve(event.id, cat.id, [a, b]);
    expect((await admitReservation(seller, { eventId: event.id, code, attendeeCin: a.cin })).message).toMatch(/DOES NOT ADMIT/);

    await enableReservations(leader, event.id, 5, true);
    const { ticketIds } = await sellDigitalTickets(seller, { eventId: event.id, categoryId: cat.id, holders: [person(), person()], cashCollected: true, expectedUnitPriceMillimes: 25000 });
    expect((await admitReservation(seller, { eventId: event.id, code, attendeeCin: "12121212" })).message).toMatch(/IDENTITY/);
    expect((await admitReservation(seller, { eventId: event.id, code, attendeeCin: a.cin })).admitted).toBe(true);
    // b refused: remaining place is held for the 2 paid holders
    const refused = await admitReservation(seller, { eventId: event.id, code, attendeeCin: b.cin });
    expect(refused.admitted).toBe(false);
    expect(refused.message).toMatch(/priority/);

    // Paid holders still get in; venue reaches exactly 3
    const tks = await prisma.ticket.findMany({ where: { id: { in: ticketIds } } });
    for (const t of tks) expect((await scanTicket(seller, { eventId: event.id, qrToken: t.qrToken })).result).toBe("ADMITTED");
    const ev = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(ev.checkedInCount).toBe(3);
    expect(ev.reservationAdmitCount).toBe(1);
    void issueComplimentary;
  });

  it("concurrent scans of the same ticket admit exactly once", async () => {
    const { seller, event, cat } = await setupEvent();
    const { ticketIds } = await sellDigitalTickets(seller, { eventId: event.id, categoryId: cat.id, holders: [person()], cashCollected: true, expectedUnitPriceMillimes: 25000 });
    const tk = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketIds[0] } });
    const res = await Promise.all(Array.from({ length: 8 }, () => scanTicket(seller, { eventId: event.id, qrToken: tk.qrToken })));
    expect(res.filter((r) => r.admitted)).toHaveLength(1);
    const rep = await eventReport(event.id);
    expect(rep.attendance.totalAttendance).toBe(1);
    expect(rep.attendance.duplicateScans).toBe(7);
  });
});
