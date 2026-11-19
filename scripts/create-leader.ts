/**
 * Creates the first Team Leader on the live database (e.g. Vercel Postgres) — the safe alternative
 * to the demo seed. Run from your computer with the live database URL:
 *
 *   DATABASE_URL="<Vercel DATABASE_URL_UNPOOLED>" npm run create-leader -- "Your Name" you@example.com
 *
 * A strong random password is generated and shown ONCE; sign in and change it under "My account".
 */
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/db";

(async () => {
  const [name, email] = process.argv.slice(2);
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: npm run create-leader -- "Your Name" you@example.com');
    process.exit(1);
  }
  const normalized = email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email: normalized } })) {
    console.error(`A user with ${normalized} already exists.`);
    process.exit(1);
  }
  const password = randomBytes(15).toString("base64url");
  const u = await prisma.user.create({ data: { email: normalized, name, role: "TEAM_LEADER", passwordHash: await bcrypt.hash(password, 12) } });
  await prisma.auditLog.create({ data: { action: "USER_CREATED", entityType: "user", entityId: u.id, data: { via: "create-leader script", role: "TEAM_LEADER" } } });
  console.log(`\nTeam Leader created: ${normalized}\nTemporary password (shown once): ${password}\nSign in, then change it under "My account".\n`);
})().finally(() => prisma.$disconnect());
