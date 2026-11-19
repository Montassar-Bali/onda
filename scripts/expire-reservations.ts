import { expireDueReservations } from "../src/services/reservations";
import { prisma } from "../src/lib/db";
expireDueReservations().then((n) => console.log(`Expired ${n} reservations`)).finally(() => prisma.$disconnect());
