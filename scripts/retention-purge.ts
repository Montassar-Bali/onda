import { purgeExpiredIdentities } from "../src/services/identity";
import { prisma } from "../src/lib/db";
purgeExpiredIdentities().then((n) => console.log(`Purged CIN data for ${n} identities past retention`)).finally(() => prisma.$disconnect());
