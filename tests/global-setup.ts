import { PrismaClient } from "@prisma/client";

/** Empties the dedicated *_test database before the suite. Refuses to run against anything else. */
export default async function setup() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/\/[a-z0-9_]+_test(\?|$)/.test(url)) throw new Error(`Refusing to clean non-test database: ${url}`);
  const prisma = new PrismaClient();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  await prisma.$disconnect();
}
