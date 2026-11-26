import { Injectable } from "@nestjs/common";
import { caseActions, capabilities, activePeriod, portalPatient, currentConsent, type ActorContext } from "@fbe/access-policy";
import { ConsentPurpose, type Prisma } from "@fbe/database";
import { AccessPolicyService } from "../access/access-policy.service.js";
import { choice, object, text, uuid } from "../operations/input.js";
import { audit, audited, clinicalTransaction, conflict, requireAssignment, unavailable } from "./clinical-access.js";

export async function casePatient(db: Prisma.TransactionClient, caseId: string, now: Date) {
  const patients = await db.caseParticipant.findMany({
    where: { caseId, kind: "PATIENT", ...activePeriod(now), person: { synthetic: true, archivedAt: null },
      careCase: { synthetic: true } },
    select: { personId: true }, take: 2,
  });
  if (patients.length !== 1) unavailable();
  return patients[0]!.personId;
}

@Injectable()
export class ConsentsService {
  constructor(private readonly policy: AccessPolicyService) {}

  private async access(db: Prisma.TransactionClient, actor: ActorContext, caseId: string, now: Date) {
    const personId = await casePatient(db, caseId, now);
    const patient = actor.personId === personId && await portalPatient(db, actor, caseId, now);
    if (!patient) await requireAssignment(db, actor, caseId, caseActions.consentManage, now);
    return { personId, patient };
  }

  list(actor: ActorContext, caseId: string) {
    return audited(actor, "CONSENT_READ", "CareCase", caseId, () => clinicalTransaction(async (db, now) => {
      const { personId } = await this.access(db, actor, caseId, now);
      const [templates, history] = await Promise.all([
        db.consentTemplate.findMany({ distinct: ["purpose"], orderBy: [{ purpose: "asc" }, { version: "desc" }] }),
        db.consentRecord.findMany({ where: { caseId, personId },
          include: { template: true }, orderBy: [{ acceptedAt: "desc" }, { id: "desc" }] }),
      ]);
      await audit(db, actor, "CONSENT_READ", "CareCase", caseId);
      return { templates, history };
    }));
  }

  template(actor: ActorContext, body: unknown) {
    const input = object(body);
    const purpose = choice(input.purpose, Object.values(ConsentPurpose));
    const fragment = text(input.body, 12, 2400);
    return clinicalTransaction(async (db, now) => {
      await this.policy.requireCurrentCapability(db, actor, capabilities.clinicalCoordinate, now);
      const previous = await db.consentTemplate.findFirst({ where: { purpose }, orderBy: { version: "desc" } });
      const template = await db.consentTemplate.create({ data: {
        purpose, version: (previous?.version ?? 0) + 1,
        body: `Texto ficticio de prueba. ${fragment} Pendiente de validación institucional.`,
      } });
      await audit(db, actor, "CONSENT_TEMPLATE_CREATE", "ConsentTemplate", template.id);
      return template;
    });
  }

  accept(actor: ActorContext, caseId: string, body: unknown) {
    const input = object(body);
    const templateId = uuid(input.templateId);
    const medium = choice(input.medium, ["PATIENT_PORTAL", "STAFF_WITNESSED"] as const);
    if (input.confirmed !== true) conflict("CONSENT_CONFIRMATION_REQUIRED");
    return audited(actor, "CONSENT_RECORD", "CareCase", caseId, () => clinicalTransaction(async (db, now) => {
      const { personId, patient } = await this.access(db, actor, caseId, now);
      if ((medium === "PATIENT_PORTAL") !== patient) unavailable();
      const template = await db.consentTemplate.findUnique({ where: { id: templateId } });
      if (!template) unavailable();
      const latest = await db.consentTemplate.findFirstOrThrow({
        where: { purpose: template.purpose }, orderBy: { version: "desc" }, select: { id: true },
      });
      if (template.id !== latest.id) conflict("CONSENT_TEMPLATE_CHANGED");
      const previous = await currentConsent(db, caseId, personId, template.purpose);
      if (previous?.templateId === template.id && !previous.withdrawnAt) return previous;
      const evidence = await db.consentRecord.create({ data: {
        caseId, personId, templateId, medium, recordedById: actor.accountId,
        acceptedAt: now, scope: template.purpose === "CARE" ? "ATENCION_INDIVIDUAL" : "APORTE_SUPERVISADO",
      }, include: { template: true } });
      await audit(db, actor, "CONSENT_RECORD", "ConsentRecord", evidence.id);
      return evidence;
    }));
  }

  withdraw(actor: ActorContext, caseId: string, id: string) {
    return audited(actor, "CONSENT_WITHDRAW", "ConsentRecord", id, () => clinicalTransaction(async (db, now) => {
      const { personId } = await this.access(db, actor, caseId, now);
      const evidence = await db.consentRecord.findFirst({ where: { id, caseId, personId }, include: { template: true } });
      if (!evidence) unavailable();
      const latest = await currentConsent(db, caseId, personId, evidence.template.purpose);
      if (latest?.id !== evidence.id) conflict("CONSENT_HISTORY_ENTRY");
      if (evidence.withdrawnAt) return evidence;
      const withdrawn = await db.consentRecord.update({ where: { id }, data: {
        withdrawnById: actor.accountId, withdrawnAt: now,
      }, include: { template: true } });
      await audit(db, actor, "CONSENT_WITHDRAW", "ConsentRecord", id);
      return withdrawn;
    }));
  }
}
