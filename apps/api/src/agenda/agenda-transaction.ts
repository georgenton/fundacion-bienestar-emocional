import { prisma, type Prisma } from "@fbe/database";

// A single short PostgreSQL transaction lock coordinates configuration and agenda
// writers across API instances in this single-foundation staging environment.
export function agendaTransaction<T>(work: (db: Prisma.TransactionClient, now: Date) => Promise<T>) {
  return prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(614023007)`;
    const [clock] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`;
    return work(db, clock!.now);
  }, { timeout: 10_000 });
}
