import { activeAccount, activePeriod } from "@fbe/access-policy";
import { prisma, type Appointment, type Prisma } from "@fbe/database";

const oneDay = 86_400_000;
const message = "Tiene una cita de prueba programada. Consulte su horario en el portal autenticado.";

function recipientScope(caseId: string, now: Date): Prisma.UserAccountWhereInput {
  return {
    ...activeAccount("PATIENT", now),
    reminderPreference: { enabled: true },
    person: { synthetic: true, archivedAt: null, participants: { some: {
      caseId, kind: "PATIENT", portalAccess: true, ...activePeriod(now), careCase: { synthetic: true, status: "OPEN" },
    } } },
  };
}

export async function enqueueReminder(db: Prisma.TransactionClient, now: Date,
  appointment: Pick<Appointment, "id" | "caseId" | "version" | "startsAt">, accountId?: string) {
  if (appointment.startsAt <= now) return;
  const accounts = await db.userAccount.findMany({
    where: { ...recipientScope(appointment.caseId, now), ...(accountId ? { id: accountId } : {}) }, select: { id: true },
  });
  if (!accounts.length) return;
  await db.reminderJob.createMany({
    data: accounts.map(({ id }) => ({
      appointmentId: appointment.id, accountId: id, appointmentVersion: appointment.version,
      startsAt: appointment.startsAt, scheduledAt: new Date(Math.max(now.getTime(), appointment.startsAt.getTime() - oneDay)),
    })), skipDuplicates: true,
  });
}

export async function dispatchReminders() {
  return prisma.$transaction(async db => {
    // Agenda mutations and delivery use the same transaction lock. The private
    // synthetic outbox and the transition commit in one PostgreSQL transaction.
    await db.$executeRaw`SELECT pg_advisory_xact_lock(614023007)`;
    const [instant] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const now = instant!.now;
    const jobs = await db.reminderJob.findMany({
      where: { state: "READY", scheduledAt: { lte: now } }, orderBy: { scheduledAt: "asc" },
      include: { appointment: true }, take: 40,
    });
    let delivered = 0;
    for (const job of jobs) {
      const { appointment } = job;
      const valid = appointment.status === "CONFIRMED" && appointment.version === job.appointmentVersion &&
        appointment.startsAt.getTime() === job.startsAt.getTime() && appointment.startsAt > now &&
        await db.userAccount.findFirst({ where: { ...recipientScope(appointment.caseId, now), id: job.accountId },
          select: { id: true } });
      if (valid) {
        await db.reminderDelivery.create({ data: { jobId: job.id, deliveredAt: now, message } });
        delivered++;
      }
      await db.reminderJob.update({
        where: { id: job.id }, data: { attemptedAt: now, state: valid ? "DELIVERED" : "SKIPPED" },
      });
    }
    return { attempted: jobs.length, delivered, skipped: jobs.length - delivered };
  }, { timeout: 10_000 });
}
