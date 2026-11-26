import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { activeRole, caseActions, capabilities, type ActorContext } from "@fbe/access-policy";
import { AppointmentModality, prisma } from "@fbe/database";
import { AccessPolicyService } from "../access/access-policy.service.js";
import { agendaTransaction } from "../agenda/agenda-transaction.js";
import { choice, instant, invalid, object, syntheticEmail, text, uuid } from "./input.js";

const personSummary = {
  id: true, displayName: true, contactEmail: true, createdAt: true,
  userAccount: { select: { status: true } },
} as const;
const personNotAvailable = () => new NotFoundException({ code: "PERSON_NOT_AVAILABLE" });

@Injectable()
export class PeopleCasesService {
  constructor(private readonly policy: AccessPolicyService) {}

  async listPeople(actor: ActorContext, query: unknown) {
    await this.policy.requireCapability(actor, capabilities.personManage, "Person");
    const term = query === undefined ? "" : text(query, 0, 120);
    const people = await prisma.person.findMany({
      where: {
        synthetic: true, archivedAt: null,
        ...(term ? { OR: [
          { displayName: { contains: term, mode: "insensitive" as const } },
          { contactEmail: { contains: term, mode: "insensitive" as const } },
        ] } : {}),
      },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      take: 50,
      select: personSummary,
    });
    await this.policy.recordOperation(prisma, actor, capabilities.personManage, "PERSON_LIST", "Person",
      undefined, { resultCount: people.length });
    return people;
  }

  async person(actor: ActorContext, id: string) {
    await this.policy.requireCapability(actor, capabilities.personManage, "Person", id);
    const person = await prisma.person.findFirst({
      where: { id, archivedAt: null, synthetic: true },
      select: {
        ...personSummary,
        participants: {
          where: { kind: "PATIENT", careCase: { synthetic: true } },
          orderBy: { startsAt: "desc" },
          select: { careCase: {
            select: {
              id: true, referenceCode: true, status: true, openedAt: true, serviceId: true, modality: true,
              service: { select: { name: true } },
              assignments: {
                orderBy: { startsAt: "desc" },
                select: {
                  id: true, function: true, startsAt: true, endsAt: true, revokedAt: true, allowedActions: true,
                  account: { select: { id: true, person: { select: { displayName: true } } } },
                },
              },
            },
          } },
        },
      },
    });
    if (!person) throw personNotAvailable();
    await this.policy.recordOperation(prisma, actor, capabilities.personManage, "PERSON_READ", "Person", id);
    const { participants, ...record } = person;
    return { ...record, cases: participants.map(({ careCase }) => careCase) };
  }

  async createPerson(actor: ActorContext, body: unknown) {
    const capability = capabilities.personManage;
    await this.policy.requireCapability(actor, capability, "Person");
    const input = object(body);
    const displayName = text(input.displayName, 3, 120);
    const contactEmail = input.contactEmail ? syntheticEmail(input.contactEmail) : null;
    return prisma.$transaction(async (db) => {
      await this.policy.requireCurrentCapability(db, actor, capability, new Date());
      const person = await db.person.create({
        data: { displayName, contactEmail, synthetic: true }, select: personSummary,
      });
      await this.policy.recordOperation(db, actor, capability, "PERSON_REGISTER", "Person", person.id);
      return person;
    });
  }

  async openCase(actor: ActorContext, body: unknown) {
    const capability = capabilities.caseManage;
    await this.policy.requireCapability(actor, capability, "CareCase");
    const input = object(body);
    const personId = uuid(input.personId);
    const serviceId = uuid(input.serviceId);
    const modality = choice(input.modality, Object.values(AppointmentModality));
    return agendaTransaction(async (db, now) => {
      await this.policy.requireCurrentCapability(db, actor, capability, now);
      const person = await db.person.findFirst({
        where: { id: personId, synthetic: true, archivedAt: null }, select: { id: true },
      });
      if (!person) throw personNotAvailable();
      const service = await db.serviceDefinition.findFirst({
        where: { id: serviceId, enabled: true, modalities: { has: modality } }, select: { id: true },
      });
      if (!service) invalid("SERVICE_MODALITY_DISABLED");
      const careCase = await db.careCase.create({
        data: {
          referenceCode: `SYN-${randomUUID().toUpperCase()}`, synthetic: true, openedAt: now, serviceId, modality,
          participants: { create: { personId, kind: "PATIENT", portalAccess: true, startsAt: now } },
        },
        select: { id: true, referenceCode: true, status: true, serviceId: true, modality: true },
      });
      await this.policy.recordOperation(db, actor, capability, "CASE_OPEN", "CareCase", careCase.id);
      return careCase;
    });
  }

  async assignProfessional(actor: ActorContext, caseId: string, body: unknown) {
    const capability = capabilities.caseManage;
    await this.policy.requireCapability(actor, capability, "CareCase", caseId);
    const input = object(body);
    const professionalId = uuid(input.professionalId);
    const startsAt = input.startsAt === undefined ? undefined : instant(input.startsAt);
    const endsAt = input.endsAt === undefined ? null : instant(input.endsAt);
    return agendaTransaction(async (db, now) => {
      await this.policy.requireCurrentCapability(db, actor, capability, now);
      const starts = startsAt ?? now;
      if (endsAt && (endsAt <= starts || endsAt <= now)) invalid("ASSIGNMENT_PERIOD_INVALID");
      const careCase = await db.careCase.findFirst({
        where: { id: caseId, synthetic: true, status: "OPEN" }, select: { serviceId: true, modality: true },
      });
      if (!careCase?.serviceId || !careCase.modality) invalid("CASE_NOT_BOOKABLE");
      const eligible = await db.serviceProfessional.findFirst({
        where: {
          serviceId: careCase.serviceId, professionalId, enabled: true,
          service: { enabled: true, modalities: { has: careCase.modality } },
          professional: { status: "ACTIVE", roles: { some: activeRole("PROFESSIONAL", now) } },
        },
        select: { professionalId: true },
      });
      if (!eligible) invalid("PROFESSIONAL_NOT_ELIGIBLE");
      const overlaps = await db.caseAssignment.findFirst({
        where: {
          caseId, accountId: professionalId, function: "TREATING_PROFESSIONAL", revokedAt: null,
          ...(endsAt ? { startsAt: { lt: endsAt } } : {}),
          OR: [{ endsAt: null }, { endsAt: { gt: starts } }],
        },
        select: { id: true },
      });
      if (overlaps) throw new ConflictException({ code: "ASSIGNMENT_OVERLAP" });
      const assignment = await db.caseAssignment.create({
        data: {
          caseId, accountId: professionalId, function: "TREATING_PROFESSIONAL",
          allowedActions: [caseActions.overviewRead, caseActions.appointmentRead], startsAt: starts, endsAt,
        },
      });
      await this.policy.recordOperation(db, actor, capability, "CASE_ASSIGN", "CaseAssignment", assignment.id);
      return assignment;
    });
  }
}
