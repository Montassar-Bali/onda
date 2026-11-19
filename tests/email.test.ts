import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { formatManualCode } from "@/lib/tokens";
import { sellDigitalTickets, resendTicketEmail } from "@/services/sales";
import { person, setupEvent } from "./helpers";

const outbox = (to: string) => prisma.emailOutbox.findMany({ where: { to }, orderBy: { createdAt: "asc" } });

describe("ticket emails", () => {
  it("the buyer gets every ticket; each attendee gets their own", async () => {
    const { seller, event, cat } = await setupEvent();
    const buyer = person("Buyer Person"), a = person("Amira Ben Ali"), b = person("Bilel Trabelsi");
    const r = await sellDigitalTickets(seller, { eventId: event.id, categoryId: cat.id, holders: [a, b], purchaser: buyer, cashCollected: true, expectedUnitPriceMillimes: 25000 });
    expect(r.emails.map((e) => e.to).sort()).toEqual([buyer.email, a.email, b.email].sort());
    expect(r.emails.find((e) => e.to === buyer.email)?.tickets).toBe(2);
    expect(r.emails.find((e) => e.to === a.email)?.tickets).toBe(1);

    const [toBuyer] = await outbox(buyer.email);
    expect(toBuyer.subject).toMatch(/^Your 2 ONDA tickets/);
    const tickets = await prisma.ticket.findMany({ where: { id: { in: r.ticketIds } } });
    for (const t of tickets) {
      expect(toBuyer.html).toContain(formatManualCode(t.manualCode));
      expect(toBuyer.html).toContain(`/t/${t.qrToken}`);
    }
    const [toA] = await outbox(a.email);
    expect(toA.subject).toMatch(/^Your ONDA ticket —/);
    const aTicket = tickets.find((t) => toA.html.includes(t.qrToken))!;
    expect(toA.html).not.toContain(tickets.find((t) => t.id !== aTicket.id)!.qrToken); // never someone else's ticket
    for (const html of [toBuyer.html, toA.html]) for (const p of [buyer, a, b]) expect(html).not.toContain(p.cin);
  });

  it("when the buyer is also an attendee, they get one email with all tickets", async () => {
    const { seller, event, cat } = await setupEvent();
    const a = person("First Holder"), b = person("Second Holder");
    const r = await sellDigitalTickets(seller, { eventId: event.id, categoryId: cat.id, holders: [a, b], cashCollected: true, expectedUnitPriceMillimes: 25000 });
    expect(r.emails).toHaveLength(2);
    expect(r.emails.find((e) => e.to === a.email)?.tickets).toBe(2);
    expect(r.emails.find((e) => e.to === b.email)?.tickets).toBe(1);
  });

  it("only a Team Leader can resend, and only to the addresses on the ticket", async () => {
    const { leader, seller, event, cat } = await setupEvent();
    const a = person("Resend Person");
    const r = await sellDigitalTickets(seller, { eventId: event.id, categoryId: cat.id, holders: [a], cashCollected: true, expectedUnitPriceMillimes: 25000 });
    await expect(resendTicketEmail(seller, r.ticketIds[0])).rejects.toMatchObject({ code: "FORBIDDEN" });
    const again = await resendTicketEmail(leader, r.ticketIds[0]);
    expect(again.emails.map((e) => e.to)).toEqual([a.email]);
    expect(await outbox(a.email)).toHaveLength(2);
  });
});
