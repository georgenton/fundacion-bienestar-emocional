import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { activeRole, capabilities, type ActorContext } from "@fbe/access-policy";
import { AppointmentModality, prisma, type Prisma } from "@fbe/database";
import { AccessPolicyService } from "../access/access-policy.service.js";
import { choice, flag, instant, integer, invalid, object, text, uuid } from "../operations/input.js";
import { agendaTransaction } from "./agenda-transaction.js";

const capability = capabilities.agendaConfigure;

@Injectable()
export class CatalogService {
  constructor(private readonly policy: AccessPolicyService) {}

  async catalog(actor: ActorContext) {
    await this.policy.requireCapability(actor, capability, "ServiceDefinition");
    const now = new Date();
    const [services, professionals] = await Promise.all([
      prisma.serviceDefinition.findMany({
        orderBy: [{ enabled: "desc" }, { name: "asc" }], take: 100,
        include: {
          professionals: { select: { professionalId: true, enabled: true } },
          tariffs: { orderBy: { startsAt: "desc" }, take: 20 },
        },
      }),
      prisma.userAccount.findMany({
        where: { status: "ACTIVE", person: { synthetic: true, archivedAt: null }, roles: { some: activeRole("PROFESSIONAL", now) } },
        orderBy: { person: { displayName: "asc" } }, take: 100,
        select: {
          id: true, person: { select: { displayName: true } },
          workingHours: { orderBy: { weekday: "asc" } },
          absences: { where: { endsAt: { gt: now } }, orderBy: { startsAt: "asc" }, take: 50 },
        },
      }),
    ]);
    return { services, professionals, timezone: "America/Guayaquil" };
  }

  async saveService(actor: ActorContext, body: unknown) {
    const input = object(body);
    const id = input.id === undefined ? undefined : uuid(input.id);
    const enabled = flag(input.enabled);
    if (!Array.isArray(input.modalities) || input.modalities.length > 2) invalid();
    const modalities = [...new Set(input.modalities.map(value => choice(value, Object.values(AppointmentModality))))];
    if (enabled && !modalities.length) invalid("SERVICE_MODALITY_REQUIRED");
    const data = {
      name: text(input.name, 3, 100), enabled, modalities,
      durationMinutes: integer(input.durationMinutes, 5, 240),
      marginMinutes: integer(input.marginMinutes, 0, 120),
    };
    return this.configure(actor, "SERVICE_SAVE", "ServiceDefinition", async (db) => {
      if (id) await this.requireService(db, id);
      return id ? db.serviceDefinition.update({ where: { id }, data }) : db.serviceDefinition.create({ data });
    }, result => result.id);
  }

  async eligibility(actor: ActorContext, body: unknown) {
    const input = object(body);
    const serviceId = uuid(input.serviceId);
    const professionalId = uuid(input.professionalId);
    const enabled = flag(input.enabled);
    return this.configure(actor, "SERVICE_ELIGIBILITY_SET", "ServiceDefinition", async (db, now) => {
      await this.requireService(db, serviceId);
      await this.requireProfessional(db, professionalId, now);
      return db.serviceProfessional.upsert({
        where: { serviceId_professionalId: { serviceId, professionalId } },
        create: { serviceId, professionalId, enabled }, update: { enabled },
      });
    }, () => serviceId);
  }

  async hours(actor: ActorContext, body: unknown) {
    const input = object(body);
    const professionalId = uuid(input.professionalId);
    const weekday = integer(input.weekday, 1, 7);
    const enabled = flag(input.enabled);
    const opensMinute = enabled ? integer(input.opensMinute, 0, 1439) : 0;
    const closesMinute = enabled ? integer(input.closesMinute, 1, 1440) : 0;
    if (enabled && opensMinute >= closesMinute) invalid("HOURS_INVALID");
    return this.configure(actor, "PROFESSIONAL_HOURS_SET", "UserAccount", async (db, now) => {
      await this.requireProfessional(db, professionalId, now);
      if (!enabled) {
        await db.professionalHours.deleteMany({ where: { professionalId, weekday } });
        return { professionalId, weekday, enabled };
      }
      return db.professionalHours.upsert({
        where: { professionalId_weekday: { professionalId, weekday } },
        create: { professionalId, weekday, opensMinute, closesMinute },
        update: { opensMinute, closesMinute },
      });
    }, () => professionalId);
  }

  async tariff(actor: ActorContext, body: unknown) {
    const input = object(body);
    const serviceId = uuid(input.serviceId);
    const currency = choice(input.currency, ["USD"]);
    const amountMinor = integer(input.amountMinor, 0, 100_000_000);
    const startsAt = input.startsAt === undefined ? undefined : instant(input.startsAt);
    return this.configure(actor, "SERVICE_TARIFF_VERSION", "ServiceTariff", async (db, now) => {
      await this.requireService(db, serviceId);
      const data = { serviceId, currency, amountMinor, startsAt: startsAt ?? now };
      const existing = await db.serviceTariff.findUnique({
        where: { serviceId_startsAt: { serviceId, startsAt: data.startsAt } }, select: { id: true },
      });
      if (existing) throw new ConflictException({ code: "TARIFF_VERSION_CONFLICT" });
      return db.serviceTariff.create({ data });
    }, result => result.id);
  }

  async absence(actor: ActorContext, body: unknown) {
    const input = object(body);
    const professionalId = uuid(input.professionalId);
    const startsAt = instant(input.startsAt);
    const endsAt = instant(input.endsAt);
    if (startsAt >= endsAt) invalid("ABSENCE_PERIOD_INVALID");
    return this.configure(actor, "PROFESSIONAL_ABSENCE_CREATE", "ProfessionalAbsence", async (db, now) => {
      await this.requireProfessional(db, professionalId, now);
      const absence = await db.professionalAbsence.create({ data: { professionalId, startsAt, endsAt } });
      return { ...absence, conflicts: await this.conflicts(db, absence, now) };
    }, result => result.id);
  }

  async absenceConflicts(actor: ActorContext, id: string) {
    await this.policy.requireCapability(actor, capability, "ProfessionalAbsence", id);
    const absence = await prisma.professionalAbsence.findUnique({ where: { id } });
    if (!absence) throw new NotFoundException({ code: "ABSENCE_NOT_AVAILABLE" });
    return { ...absence, conflicts: await this.conflicts(prisma, absence, new Date()) };
  }

  async removeAbsence(actor: ActorContext, id: string) {
    return this.configure(actor, "PROFESSIONAL_ABSENCE_REMOVE", "ProfessionalAbsence", async (db) => {
      const removed = await db.professionalAbsence.deleteMany({ where: { id } });
      if (!removed.count) throw new NotFoundException({ code: "ABSENCE_NOT_AVAILABLE" });
      return { id };
    }, () => id);
  }

  private async configure<T>(
    actor: ActorContext, action: string, resource: string,
    write: (db: Prisma.TransactionClient, now: Date) => Promise<T>, identity: (result: T) => string,
  ) {
    await this.policy.requireCapability(actor, capability, resource);
    return agendaTransaction(async (db, now) => {
      await this.policy.requireCurrentCapability(db, actor, capability, now);
      const result = await write(db, now);
      await this.policy.recordOperation(db, actor, capability, action, resource, identity(result));
      return result;
    });
  }

  private async requireProfessional(db: Prisma.TransactionClient, id: string, at: Date) {
    const professional = await db.userAccount.findFirst({
      where: { id, status: "ACTIVE", person: { synthetic: true, archivedAt: null }, roles: { some: activeRole("PROFESSIONAL", at) } },
      select: { id: true },
    });
    if (!professional) invalid("PROFESSIONAL_NOT_ELIGIBLE");
  }

  private async requireService(db: Prisma.TransactionClient, id: string) {
    const service = await db.serviceDefinition.findUnique({ where: { id }, select: { id: true } });
    if (!service) throw new NotFoundException({ code: "SERVICE_NOT_AVAILABLE" });
  }

  private conflicts(
    db: Prisma.TransactionClient, absence: { professionalId: string; startsAt: Date; endsAt: Date }, now: Date,
  ) {
    return db.appointment.findMany({
      where: {
        professionalId: absence.professionalId,
        startsAt: { lt: absence.endsAt }, occupiedUntil: { gt: absence.startsAt },
        attendance: "UNRECORDED",
        OR: [{ status: "CONFIRMED" }, { status: "HELD", holdExpiresAt: { gt: now } }],
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true, startsAt: true, endsAt: true, status: true,
        careCase: { select: { referenceCode: true } },
      },
    });
  }
}
