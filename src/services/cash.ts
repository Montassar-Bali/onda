import { z } from "zod";
import { advisoryLock, prisma, tx, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { tndSchema, uuid } from "@/lib/validation";
import { requireEventAccess, requireLeader } from "./guards";
import type { Actor } from "./types";

/**
 * Seller cash accountability (spec §6).
 *   expected    = Σ SALE − Σ authorized REVERSAL           (cash_transactions ledger)
 *   reconciled  = Σ counted cash confirmed by a Team Leader  (cash_reconciliations)
 *   outstanding = expected − reconciled
 * A seller's handover declaration NEVER reduces the liability; only a Team Leader's count does.
 */

export interface AccountSummary {
  accountId: string; sellerId: string; sellerName: string; eventId: string;
  ticketsSold: number; expectedMillimes: number; reconciledMillimes: number; outstandingMillimes: number;
  pendingDeclaredMillimes: number; openDiscrepancies: number; openDiscrepancyMillimes: number;
  status: "SETTLED" | "OUTSTANDING" | "DISCREPANCY" | "HANDOVER_PENDING";
}

export async function accountSummaries(eventId: string, sellerId?: string): Promise<AccountSummary[]> {
  const accounts = await prisma.sellerCashAccount.findMany({
    where: { eventId, ...(sellerId ? { sellerId } : {}) },
    include: {
      seller: { select: { name: true } },
      handovers: { where: { status: "SUBMITTED" } },
      discrepancies: { where: { status: { not: "RESOLVED" } } },
      _count: { select: { transactions: { where: { type: "SALE" } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  const reversals = await prisma.cashTransaction.groupBy({ by: ["accountId"], where: { eventId, type: "REVERSAL" }, _count: true });
  const revMap = new Map(reversals.map((r) => [r.accountId, r._count]));
  return accounts.map((a) => {
    const outstanding = a.expectedMillimes - a.reconciledMillimes;
    const pending = a.handovers.reduce((s, h) => s + h.declaredMillimes, 0);
    const discMillimes = a.discrepancies.reduce((s, d) => s + d.amountMillimes, 0);
    return {
      accountId: a.id, sellerId: a.sellerId, sellerName: a.seller.name, eventId: a.eventId,
      ticketsSold: a._count.transactions - (revMap.get(a.id) ?? 0),
      expectedMillimes: a.expectedMillimes, reconciledMillimes: a.reconciledMillimes, outstandingMillimes: outstanding,
      pendingDeclaredMillimes: pending, openDiscrepancies: a.discrepancies.length, openDiscrepancyMillimes: discMillimes,
      status: a.discrepancies.length > 0 ? "DISCREPANCY" : pending > 0 ? "HANDOVER_PENDING" : outstanding === 0 ? "SETTLED" : "OUTSTANDING",
    };
  });
}

/** Independently reconstructs an account from the append-only ledgers and compares with cached totals. */
export async function reconstructAccount(accountId: string) {
  const [acc, ledger, recon] = await Promise.all([
    prisma.sellerCashAccount.findUniqueOrThrow({ where: { id: accountId } }),
    prisma.cashTransaction.aggregate({ where: { accountId }, _sum: { amountMillimes: true } }),
    prisma.cashReconciliation.aggregate({ where: { accountId }, _sum: { countedMillimes: true } }),
  ]);
  const expected = ledger._sum.amountMillimes ?? 0;
  const reconciled = recon._sum.countedMillimes ?? 0;
  return {
    expectedMillimes: expected, reconciledMillimes: reconciled, outstandingMillimes: expected - reconciled,
    consistent: expected === acc.expectedMillimes && reconciled === acc.reconciledMillimes,
  };
}

// ───────────────────────────── seller handover declaration ─────────────────────────────

export const handoverInput = z.object({ eventId: uuid, amount: tndSchema.refine((v) => v > 0, "Amount must be positive"), note: z.string().max(500).optional() });

export async function submitHandover(actor: Actor, raw: unknown) {
  const d = handoverInput.parse(raw);
  await requireEventAccess(actor, d.eventId);
  return tx(async (t) => {
    const account = await t.sellerCashAccount.findUnique({ where: { sellerId_eventId: { sellerId: actor.id, eventId: d.eventId } } });
    if (!account) throw invalid("NO_ACCOUNT", "You have no cash sales for this event");
    const pending = await t.cashHandover.count({ where: { accountId: account.id, status: "SUBMITTED" } });
    if (pending > 0) throw conflict("HANDOVER_PENDING", "You already have a handover awaiting Team Leader confirmation");
    const h = await t.cashHandover.create({ data: { accountId: account.id, sellerId: actor.id, declaredMillimes: d.amount, note: d.note } });
    await audit(t, actor.id, "CASH_HANDOVER_SUBMITTED", "cash_handover", h.id, { declaredMillimes: d.amount, eventId: d.eventId }, actor.ip);
    return h;
  });
}

export async function cancelHandover(actor: Actor, handoverId: string) {
  return tx(async (t) => {
    const h = await t.cashHandover.findUnique({ where: { id: handoverId } });
    if (!h) throw notFound();
    if (h.sellerId !== actor.id && actor.role !== "TEAM_LEADER") throw forbidden();
    if (h.status !== "SUBMITTED") throw conflict("NOT_PENDING", "Handover is not pending");
    await t.cashHandover.update({ where: { id: h.id }, data: { status: "CANCELLED" } });
    await audit(t, actor.id, "CASH_HANDOVER_CANCELLED", "cash_handover", h.id, {}, actor.ip);
  });
}

// ───────────────────────────── Team Leader reconciliation ─────────────────────────────

export const reconcileInput = z.object({
  accountId: uuid,
  handoverId: uuid.optional().nullable(),
  /** Cash physically counted by the Team Leader. */
  counted: tndSchema.refine((v) => v >= 0, "Counted amount cannot be negative"),
  /** Final settlement for the event: any remaining outstanding balance becomes a discrepancy. */
  isFinal: z.boolean().default(false),
  requireExplanation: z.boolean().default(false),
  note: z.string().max(1000).optional(),
});

export async function reconcile(actor: Actor, raw: unknown) {
  requireLeader(actor);
  const d = reconcileInput.parse(raw);
  return tx(async (t) => {
    await advisoryLock(t, `cash-account:${d.accountId}`);
    const account = await t.sellerCashAccount.findUnique({ where: { id: d.accountId } });
    if (!account) throw notFound("Cash account not found");
    if (account.sellerId === actor.id) throw forbidden("You cannot reconcile your own cash account; another Team Leader must count it");

    let declared: number | null = null;
    if (d.handoverId) {
      const h = await t.cashHandover.findUnique({ where: { id: d.handoverId } });
      if (!h || h.accountId !== account.id) throw notFound("Handover not found for this account");
      if (h.status !== "SUBMITTED") throw conflict("HANDOVER_CLOSED", "This handover was already processed");
      declared = h.declaredMillimes;
    }
    if (d.counted === 0 && !d.isFinal) throw invalid("NOTHING_COUNTED", "Record a counted amount, or mark as final settlement");

    const outstandingBefore = account.expectedMillimes - account.reconciledMillimes;
    const outstandingAfter = outstandingBefore - d.counted;

    // Discrepancies — never erase liability; just record and flag.
    const discrepancies: { amount: number; kind: string }[] = [];
    if (d.isFinal) {
      if (outstandingAfter !== 0) discrepancies.push({ amount: outstandingAfter, kind: "FINAL_OUTSTANDING" });
    } else if (declared !== null && declared !== d.counted) {
      discrepancies.push({ amount: declared - d.counted, kind: "DECLARED_VS_COUNTED" });
    }

    const rec = await t.cashReconciliation.create({
      data: {
        accountId: account.id, sellerId: account.sellerId, handoverId: d.handoverId ?? null, reconciledById: actor.id,
        countedMillimes: d.counted, declaredMillimes: declared, expectedBeforeMillimes: account.expectedMillimes,
        outstandingBeforeMillimes: outstandingBefore, isFinal: d.isFinal,
        outcome: discrepancies.length ? "DISCREPANCY" : "BALANCED", note: d.note,
      },
    });
    const updated = await t.sellerCashAccount.update({ where: { id: account.id }, data: { reconciledMillimes: { increment: d.counted } } });
    if (d.handoverId) await t.cashHandover.update({ where: { id: d.handoverId }, data: { status: "RECEIVED" } });
    for (const disc of discrepancies) {
      await t.cashDiscrepancy.create({
        data: { accountId: account.id, reconciliationId: rec.id, amountMillimes: disc.amount, kind: disc.kind, status: d.requireExplanation ? "EXPLANATION_REQUIRED" : "OPEN" },
      });
    }
    await markReconciledTickets(t, actor, account.id, updated.reconciledMillimes);
    await audit(t, actor.id, "CASH_RECONCILED", "cash_reconciliation", rec.id, {
      accountId: account.id, sellerId: account.sellerId, countedMillimes: d.counted, declaredMillimes: declared,
      outstandingBefore, outstandingAfter, discrepancies,
    }, actor.ip);
    return { reconciliation: rec, outstandingAfterMillimes: outstandingAfter, discrepancies };
  });
}

/**
 * Moves ticket payment status CASH_REPORTED_COLLECTED → CASH_RECONCILED in sale order (FIFO)
 * for every ticket fully covered by the cumulative reconciled cash.
 */
async function markReconciledTickets(t: Tx, actor: Actor, accountId: string, reconciledTotal: number) {
  const sales = await t.cashTransaction.findMany({
    where: { accountId, type: "SALE", reversedBy: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { ticketId: true, amountMillimes: true, ticket: { select: { paymentStatus: true } } },
  });
  let cum = 0;
  const toMark: string[] = [];
  for (const s of sales) {
    cum += s.amountMillimes;
    if (cum > reconciledTotal) break;
    if (s.ticket.paymentStatus === "CASH_REPORTED_COLLECTED") toMark.push(s.ticketId);
  }
  if (!toMark.length) return;
  await t.ticket.updateMany({ where: { id: { in: toMark }, paymentStatus: "CASH_REPORTED_COLLECTED" }, data: { paymentStatus: "CASH_RECONCILED" } });
  await t.ticketInventoryMovement.createMany({
    data: toMark.map((ticketId) => ({ ticketId, actorId: actor.id, action: "RECONCILED", fromPayment: "CASH_REPORTED_COLLECTED" as const, toPayment: "CASH_RECONCILED" as const })),
  });
}

// ───────────────────────────── discrepancies ─────────────────────────────

export async function requireExplanation(actor: Actor, discrepancyId: string) {
  requireLeader(actor);
  return tx(async (t) => {
    const d = await t.cashDiscrepancy.findUnique({ where: { id: discrepancyId } });
    if (!d) throw notFound();
    if (d.status === "RESOLVED") throw conflict("RESOLVED", "Already resolved");
    await t.cashDiscrepancy.update({ where: { id: d.id }, data: { status: "EXPLANATION_REQUIRED" } });
    await audit(t, actor.id, "DISCREPANCY_EXPLANATION_REQUIRED", "cash_discrepancy", d.id, {}, actor.ip);
  });
}

export async function explainDiscrepancy(actor: Actor, discrepancyId: string, explanation: string) {
  if (explanation.trim().length < 5) throw invalid("EXPLANATION_REQUIRED", "Please write an explanation");
  return tx(async (t) => {
    const d = await t.cashDiscrepancy.findUnique({ where: { id: discrepancyId }, include: { account: true } });
    if (!d) throw notFound();
    if (d.account.sellerId !== actor.id) throw forbidden("You can only explain your own discrepancies");
    if (d.status === "RESOLVED") throw conflict("RESOLVED", "Already resolved");
    await t.cashDiscrepancy.update({ where: { id: d.id }, data: { status: "EXPLAINED", explanation, explainedAt: new Date() } });
    await audit(t, actor.id, "DISCREPANCY_EXPLAINED", "cash_discrepancy", d.id, { length: explanation.length }, actor.ip);
  });
}

/** Closes the review. It does NOT change the seller's balance — only counted cash does. */
export async function resolveDiscrepancy(actor: Actor, discrepancyId: string, note: string) {
  requireLeader(actor);
  if (note.trim().length < 5) throw invalid("NOTE_REQUIRED", "A resolution note is required");
  return tx(async (t) => {
    const d = await t.cashDiscrepancy.findUnique({ where: { id: discrepancyId }, include: { account: true } });
    if (!d) throw notFound();
    if (d.account.sellerId === actor.id) throw forbidden("You cannot resolve a discrepancy on your own account");
    if (d.status === "RESOLVED") throw conflict("RESOLVED", "Already resolved");
    await t.cashDiscrepancy.update({ where: { id: d.id }, data: { status: "RESOLVED", resolvedById: actor.id, resolutionNote: note, resolvedAt: new Date() } });
    await audit(t, actor.id, "DISCREPANCY_RESOLVED", "cash_discrepancy", d.id, { note }, actor.ip);
  });
}

export function accountHistory(accountId: string) {
  return prisma.sellerCashAccount.findUnique({
    where: { id: accountId },
    include: {
      seller: { select: { name: true, email: true } },
      event: { select: { name: true, theme: true } },
      transactions: { orderBy: { createdAt: "desc" }, include: { ticket: { select: { serial: true, kind: true } }, salesPoint: { select: { name: true } } } },
      handovers: { orderBy: { createdAt: "desc" } },
      reconciliations: { orderBy: { createdAt: "desc" }, include: { reconciledBy: { select: { name: true } } } },
      discrepancies: { orderBy: { createdAt: "desc" } },
    },
  });
}
