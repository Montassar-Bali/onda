import { PrismaClient, Prisma } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

export type Tx = Prisma.TransactionClient;

/** Runs fn in a SERIALIZABLE-safe read-committed transaction; all business writes go through here. */
export function tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20000 });
}

/** Transaction-scoped advisory lock (serializes per-identity / per-account critical sections). */
export async function advisoryLock(t: Tx, key: string) {
  await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
