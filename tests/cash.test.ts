import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sellDigitalTickets } from "@/services/sales";
import { accountSummaries, explainDiscrepancy, reconcile, reconstructAccount, resolveDiscrepancy, submitHandover } from "@/services/cash";
import { mkUser, person, setupEvent } from "./helpers";

describe("seller cash accountability", () => {
  it("spec example: 30 × 25.000 TND, declared 750, handed 700 → 50.000 TND discrepancy, liability not erased", async () => {
    const { leader, seller, event, cat } = await setupEvent();
    for (let i = 0; i < 30; i++) {
      await sellDigitalTickets(seller, { eventId: event.id, categoryId: cat.id, holders: [person()], cashCollected: true, expectedUnitPriceMillimes: 25000 });
    }
    const [before] = await accountSummaries(event.id, seller.id);
    expect(before.expectedMillimes).toBe(750000);
    expect(before.ticketsSold).toBe(30);

    const h = await submitHandover(seller, { eventId: event.id, amount: "750.000" });
    const [pending] = await accountSummaries(event.id, seller.id);
    expect(pending.outstandingMillimes).toBe(750000); // declaration does NOT reduce liability
    expect(pending.status).toBe("HANDOVER_PENDING");

    // Seller cannot reconcile their own account
    await expect(reconcile(seller, { accountId: before.accountId, handoverId: h.id, counted: "750" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const r = await reconcile(leader, { accountId: before.accountId, handoverId: h.id, counted: "700.000", requireExplanation: true });
    expect(r.reconciliation.outcome).toBe("DISCREPANCY");
    expect(r.discrepancies).toEqual([{ amount: 50000, kind: "DECLARED_VS_COUNTED" }]);

    const [after] = await accountSummaries(event.id, seller.id);
    expect(after.reconciledMillimes).toBe(700000);
    expect(after.outstandingMillimes).toBe(50000);
    expect(after.status).toBe("DISCREPANCY");

    // 28 tickets fully covered by 700 TND → CASH_RECONCILED (FIFO); 2 still reported
    expect(await prisma.ticket.count({ where: { eventId: event.id, paymentStatus: "CASH_RECONCILED" } })).toBe(28);
    expect(await prisma.ticket.count({ where: { eventId: event.id, paymentStatus: "CASH_REPORTED_COLLECTED" } })).toBe(2);

    const disc = await prisma.cashDiscrepancy.findFirstOrThrow({ where: { accountId: before.accountId } });
    expect(disc.status).toBe("EXPLANATION_REQUIRED");
    await explainDiscrepancy(seller, disc.id, "Lost an envelope, will bring tomorrow");
    await expect(resolveDiscrepancy(seller, disc.id, "self-approve")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await resolveDiscrepancy(leader, disc.id, "Seller will repay; tracked");
    const [resolved] = await accountSummaries(event.id, seller.id);
    expect(resolved.outstandingMillimes).toBe(50000); // resolution never erases liability

    const rebuilt = await reconstructAccount(before.accountId);
    expect(rebuilt).toMatchObject({ expectedMillimes: 750000, reconciledMillimes: 700000, outstandingMillimes: 50000, consistent: true });
  });

  it("final settlement flags any remaining outstanding balance", async () => {
    const { leader, seller, event, cat } = await setupEvent();
    await sellDigitalTickets(seller, { eventId: event.id, categoryId: cat.id, holders: [person(), person()], cashCollected: true, expectedUnitPriceMillimes: 25000 });
    const [acc] = await accountSummaries(event.id, seller.id);
    const r = await reconcile(leader, { accountId: acc.accountId, counted: "40.000", isFinal: true });
    expect(r.discrepancies).toEqual([{ amount: 10000, kind: "FINAL_OUTSTANDING" }]);
    const r2 = await reconcile(leader, { accountId: acc.accountId, counted: "10.000", isFinal: true });
    expect(r2.reconciliation.outcome).toBe("BALANCED");
  });

  it("a Team Leader who sells cannot reconcile their own account (also enforced by DB CHECK)", async () => {
    const { leader, event, cat } = await setupEvent();
    await sellDigitalTickets(leader, { eventId: event.id, categoryId: cat.id, holders: [person()], cashCollected: true, expectedUnitPriceMillimes: 25000 });
    const [acc] = await accountSummaries(event.id, leader.id);
    await expect(reconcile(leader, { accountId: acc.accountId, counted: "25" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const other = await mkUser("TEAM_LEADER");
    await expect(reconcile(other, { accountId: acc.accountId, counted: "25" })).resolves.toBeTruthy();
  });

  it("financial history is append-only at the database level", async () => {
    const { seller, event, cat } = await setupEvent();
    await sellDigitalTickets(seller, { eventId: event.id, categoryId: cat.id, holders: [person()], cashCollected: true, expectedUnitPriceMillimes: 25000 });
    await expect(prisma.$executeRawUnsafe(`UPDATE cash_transactions SET amount_millimes = 1 WHERE event_id = '${event.id}'`)).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM cash_transactions WHERE event_id = '${event.id}'`)).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM audit_logs`)).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`UPDATE tickets SET price_millimes = 1 WHERE event_id = '${event.id}'`)).rejects.toThrow(/immutable/);
  });
});
