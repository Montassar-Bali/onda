import { prisma } from "@/lib/db";

/**
 * Event report (spec §8). Paid sales, physical inventory, reservations and attendance are
 * computed independently and NEVER combined. All money values are integer millimes.
 */
export async function eventReport(eventId: string) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { categories: true, reservationInventory: true } });
  const catName = new Map(event.categories.map((c) => [c.id, c.name]));

  const [salesByCat, salesBySeller, salesByPoint, cashTotals, reconciled, accounts, physical, batches, printedQty, resByStatus, resAttendees, resByCat, resByDay, scans, attendance, compCheckedIn] =
    await Promise.all([
      prisma.ticket.groupBy({ by: ["categoryId"], where: { eventId, kind: { in: ["DIGITAL", "PHYSICAL"] }, inventoryStatus: "SOLD" }, _count: true, _sum: { priceMillimes: true } }),
      prisma.cashTransaction.groupBy({ by: ["sellerId"], where: { eventId }, _sum: { amountMillimes: true } }),
      prisma.cashTransaction.groupBy({ by: ["salesPointId"], where: { eventId }, _sum: { amountMillimes: true } }),
      prisma.cashTransaction.groupBy({ by: ["type"], where: { eventId }, _sum: { amountMillimes: true }, _count: true }),
      prisma.cashReconciliation.aggregate({ where: { account: { eventId } }, _sum: { countedMillimes: true } }),
      prisma.sellerCashAccount.findMany({ where: { eventId }, include: { seller: { select: { name: true } } } }),
      prisma.ticket.groupBy({ by: ["inventoryStatus"], where: { eventId, kind: "PHYSICAL" }, _count: true }),
      prisma.physicalTicketBatch.aggregate({ where: { eventId }, _sum: { quantity: true }, _count: true }),
      prisma.physicalTicketBatch.aggregate({ where: { eventId, printedAt: { not: null } }, _sum: { quantity: true } }),
      prisma.reservation.groupBy({ by: ["status"], where: { eventId }, _count: true }),
      prisma.reservationAttendee.groupBy({ by: ["eventId"], where: { eventId }, _count: true }),
      prisma.reservation.groupBy({ by: ["categoryId"], where: { eventId }, _count: true }),
      prisma.$queryRaw<{ day: Date; n: bigint }[]>`SELECT date_trunc('day', created_at) AS day, count(*) AS n FROM reservations WHERE event_id = ${eventId}::uuid GROUP BY 1 ORDER BY 1`,
      prisma.scanLog.groupBy({ by: ["result"], where: { eventId }, _count: true }),
      prisma.ticket.groupBy({ by: ["kind"], where: { eventId, admissionStatus: "CHECKED_IN" }, _count: true }),
      prisma.ticket.count({ where: { eventId, kind: "COMPLIMENTARY", admissionStatus: "CHECKED_IN" } }),
    ]);

  const sellerIds = salesBySeller.map((s) => s.sellerId);
  const pointIds = salesByPoint.map((s) => s.salesPointId).filter(Boolean) as string[];
  const [sellers, points, activatedPhysical, physicalSoldPaid] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true } }),
    prisma.salesPoint.findMany({ where: { id: { in: pointIds } }, select: { id: true, name: true } }),
    prisma.ticket.count({ where: { eventId, kind: "PHYSICAL", soldById: { not: null } } }),
    prisma.ticket.count({ where: { eventId, kind: "PHYSICAL", inventoryStatus: "SOLD" } }),
  ]);
  const sellerName = new Map(sellers.map((s) => [s.id, s.name]));
  const pointName = new Map(points.map((p) => [p.id, p.name]));
  const typeSum = (t: string) => cashTotals.find((c) => c.type === t)?._sum.amountMillimes ?? 0;
  const physCount = (s: string) => physical.find((p) => p.inventoryStatus === s)?._count ?? 0;
  const resCount = (s: string) => resByStatus.find((r) => r.status === s)?._count ?? 0;
  const scanCount = (s: string) => scans.find((r) => r.result === s)?._count ?? 0;
  const paidCheckedIn = attendance.filter((a) => a.kind !== "COMPLIMENTARY").reduce((s, a) => s + a._count, 0);

  const reportedCollected = typeSum("SALE") + typeSum("REVERSAL");
  const cashReconciled = reconciled._sum.countedMillimes ?? 0;

  return {
    event: { id: event.id, name: event.name, venueCapacity: event.venueCapacity, paidTicketCapacity: event.paidTicketCapacity, complimentaryAllocation: event.complimentaryAllocation, status: event.status },
    paid: {
      ticketsSold: event.paidSoldCount,
      paidRemaining: event.paidTicketCapacity - event.paidSoldCount,
      grossSalesMillimes: typeSum("SALE"),
      reversalsMillimes: -typeSum("REVERSAL"),
      cashReportedCollectedMillimes: reportedCollected,
      cashReconciledMillimes: cashReconciled,
      outstandingSellerCashMillimes: accounts.reduce((s, a) => s + a.expectedMillimes - a.reconciledMillimes, 0),
      byCategory: salesByCat.map((c) => ({ category: catName.get(c.categoryId) ?? "?", count: c._count, millimes: c._sum.priceMillimes ?? 0 })),
      bySeller: salesBySeller.map((s) => ({ seller: sellerName.get(s.sellerId) ?? "?", millimes: s._sum.amountMillimes ?? 0 })),
      bySalesPoint: salesByPoint.map((s) => ({ salesPoint: s.salesPointId ? pointName.get(s.salesPointId) ?? "?" : "Direct (no sales point)", millimes: s._sum.amountMillimes ?? 0 })),
    },
    complimentary: { issued: event.compIssuedCount, allocation: event.complimentaryAllocation, revenueMillimes: 0 },
    physical: {
      batches: batches._count,
      generated: batches._sum.quantity ?? 0,
      printed: printedQty._sum.quantity ?? 0,
      available: physCount("AVAILABLE"),
      assigned: physCount("ASSIGNED"),
      sold: physicalSoldPaid,
      activated: activatedPhysical,
      unsold: physCount("AVAILABLE") + physCount("ASSIGNED") + physCount("RETURNED"),
      returned: physCount("RETURNED"),
      voided: physCount("VOID"),
    },
    reservations: {
      quota: event.reservationInventory?.maxReservedAttendees ?? 0,
      pendingAttendees: event.reservationInventory?.pendingAttendees ?? 0,
      total: resByStatus.reduce((s, r) => s + r._count, 0),
      totalReservedAttendees: resAttendees[0]?._count ?? 0,
      pending: resCount("PENDING"), expired: resCount("EXPIRED"), cancelled: resCount("CANCELLED"), converted: resCount("CONVERTED"),
      byCategory: resByCat.map((r) => ({ category: catName.get(r.categoryId) ?? "?", count: r._count })),
      byDate: resByDay.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: Number(r.n) })),
    },
    attendance: {
      paidCheckedIn,
      complimentaryCheckedIn: compCheckedIn,
      reservationAdmissions: event.reservationAdmitCount,
      totalAttendance: event.checkedInCount,
      remainingVenueCapacity: event.venueCapacity - event.checkedInCount,
      duplicateScans: scanCount("DUPLICATE"),
      unsoldScans: scanCount("UNSOLD"),
      deniedScans: scanCount("REVOKED") + scanCount("WRONG_EVENT") + scanCount("UNKNOWN") + scanCount("VENUE_FULL") + scanCount("RESERVATION_REFUSED"),
    },
  };
}
export type EventReport = Awaited<ReturnType<typeof eventReport>>;
