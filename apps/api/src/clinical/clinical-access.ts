import { ConflictException, NotFoundException } from "@nestjs/common";
import { clinicalAssignment, type ActorContext, type CaseAction } from "@fbe/access-policy";
import { prisma, type Prisma } from "@fbe/database";

// Serialize the workflow and file publication across instances. The existing
// agenda lock is also taken for operations that start from a booking.
export function clinicalTransaction<T>(work: (db: Prisma.TransactionClient, now: Date) => Promise<T>, booking = false) {
  return prisma.$transaction(async db => {
    if (booking) await db.$executeRaw`SELECT pg_advisory_xact_lock(614023007)`;
    await db.$executeRaw`SELECT pg_advisory_xact_lock(614023008)`;
    const [clock] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`;
    return work(db, clock!.now);
  }, { timeout: 10_000 });
}

export function unavailable(): never {
  throw new NotFoundException({ code: "RECORD_NOT_AVAILABLE" });
}

export function conflict(code: string): never {
  throw new ConflictException({ code });
}

export async function requireAssignment(db: Prisma.TransactionClient, actor: ActorContext,
  caseId: string, action: CaseAction, now: Date, assignmentId?: string) {
  const assignment = await clinicalAssignment(db, actor, caseId, action, now, assignmentId);
  if (!assignment) unavailable();
  return assignment;
}

export function audit(db: Prisma.TransactionClient, actor: ActorContext, action: string,
  type: string, id: string, decision: "ALLOWED" | "DENIED" = "ALLOWED") {
  return db.auditEvent.create({
    data: { actorAccountId: actor.accountId, action, resourceType: type, resourceId: id,
      decision, reasonCode: decision === "ALLOWED" ? "AUTHORIZED_WORKFLOW" : "NO_APPLICABLE_SCOPE" },
  });
}

export async function audited<T>(actor: ActorContext, action: string, type: string, id: string, work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof NotFoundException) await audit(prisma, actor, action, type, id, "DENIED");
    throw error;
  }
}
