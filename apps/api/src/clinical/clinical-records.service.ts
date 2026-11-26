import { Injectable } from "@nestjs/common";
import { caseActions, currentConsent, type ActorContext } from "@fbe/access-policy";
import { type ClinicalNote, type Prisma } from "@fbe/database";
import { choice, integer, object, text, uuid } from "../operations/input.js";
import { audit, audited, clinicalTransaction, conflict, requireAssignment, unavailable } from "./clinical-access.js";
import { casePatient } from "./consents.service.js";

const templateVersion = "FBE-NOTA-SINTETICA-v1";
const noteDetails = { reviews: { orderBy: { version: "asc" } }, addenda: { orderBy: { createdAt: "asc" } } } as const;

function reviewerWhere(actor: ActorContext): Prisma.ClinicalNoteWhereInput {
  return { status: "IN_REVIEW", OR: [
    { practice: { supervisorId: actor.accountId } },
    { practiceId: null, authorFunction: "TREATING_PROFESSIONAL" },
  ] };
}

@Injectable()
export class ClinicalRecordsService {
  list(actor: ActorContext, caseId: string) {
    return audited(actor, "RECORD_READ", "CareCase", caseId, () => clinicalTransaction(async (db, now) => {
      const assignment = await requireAssignment(db, actor, caseId, caseActions.recordRead, now);
      const [encounters, appointments] = await Promise.all([
        db.encounter.findMany({ where: { caseId }, orderBy: { occurredAt: "desc" }, include: {
          notes: {
            where: assignment.function === "INTERN" ? { authorId: actor.accountId, assignmentId: assignment.id } : {
              OR: [
                { authorId: actor.accountId }, { status: "VALIDATED" },
                ...(assignment.function === "SUPERVISOR" ? [reviewerWhere(actor)] : []),
              ],
            },
            include: noteDetails,
            orderBy: { recordedAt: "desc" },
          },
        } }),
        assignment.function === "TREATING_PROFESSIONAL" ? db.appointment.findMany({
          where: { caseId, professionalId: actor.accountId, status: "CONFIRMED", encounter: null },
          select: { id: true, startsAt: true, modality: true, attendance: true }, orderBy: { startsAt: "desc" }, take: 40,
        }) : [],
      ]);
      await audit(db, actor, "RECORD_READ", "CareCase", caseId);
      return { encounters, appointments, function: assignment.function, actorId: actor.accountId };
    }));
  }

  open(actor: ActorContext, caseId: string, body: unknown) {
    const appointmentId = uuid(object(body).appointmentId);
    return audited(actor, "ENCOUNTER_OPEN", "CareCase", caseId, () => clinicalTransaction(async (db, now) => {
      await requireAssignment(db, actor, caseId, caseActions.encounterOpen, now);
      const appointment = await db.appointment.findFirst({ where: {
        id: appointmentId, caseId, professionalId: actor.accountId, status: "CONFIRMED",
        careCase: { status: "OPEN", synthetic: true, serviceId: { not: null }, modality: { not: null } },
      }, include: { encounter: true } });
      if (!appointment) conflict("ENCOUNTER_CONFIRMED_APPOINTMENT_REQUIRED");
      if (appointment.encounter) return appointment.encounter;
      const personId = await casePatient(db, caseId, now);
      const evidence = await currentConsent(db, caseId, personId, "CARE");
      if (!evidence || evidence.withdrawnAt) conflict("CARE_CONSENT_REVIEW_REQUIRED");
      const encounter = await db.encounter.create({
        data: { appointmentId, caseId, professionalId: actor.accountId, occurredAt: now },
      });
      await audit(db, actor, "ENCOUNTER_OPEN", "Encounter", encounter.id);
      return encounter;
    }, true));
  }

  note(actor: ActorContext, caseId: string, encounterId: string, body: unknown) {
    const narrative = text(object(body).narrative, 1, 8000);
    return audited(actor, "NOTE_CREATE", "Encounter", encounterId, () => clinicalTransaction(async (db, now) => {
      const assignment = await requireAssignment(db, actor, caseId, caseActions.noteWrite, now);
      const encounter = await db.encounter.findFirst({ where: {
        id: encounterId, caseId, careCase: { status: "OPEN" },
      } });
      if (!encounter) unavailable();
      if (encounter.status !== "OPEN") conflict("ENCOUNTER_NOT_OPEN");
      const note = await db.clinicalNote.create({ data: {
        encounterId, narrative, occurredAt: encounter.occurredAt, authorId: actor.accountId,
        assignmentId: assignment.id, authorFunction: assignment.function, practiceId: assignment.practiceId, templateVersion,
      } });
      await audit(db, actor, "NOTE_CREATE", "ClinicalNote", note.id);
      return note;
    }));
  }

  private async supervisor(db: Prisma.TransactionClient, actor: ActorContext, caseId: string,
    note: ClinicalNote, action: typeof caseActions.noteReview | typeof caseActions.noteValidate, now: Date) {
    const scope = await requireAssignment(db, actor, caseId, action, now);
    if (!note.practiceId) {
      if (note.authorId === actor.accountId && note.authorFunction === scope.function && action === caseActions.noteValidate) return;
      if (scope.function === "SUPERVISOR" && note.status === "IN_REVIEW" &&
          note.authorFunction === "TREATING_PROFESSIONAL" && note.authorId !== actor.accountId) return;
      unavailable();
    }
    if (scope.function !== "SUPERVISOR" || note.authorId === actor.accountId || note.status !== "IN_REVIEW" ||
        !(await db.practice.findFirst({ where: { id: note.practiceId, supervisorId: actor.accountId }, select: { id: true } }))) {
      unavailable();
    }
  }

  transition(actor: ActorContext, caseId: string, id: string, body: unknown) {
    const input = object(body);
    const operation = choice(input.operation, ["EDIT", "SUBMIT", "RETURN", "VALIDATE"] as const);
    const version = integer(input.version, 1, 2_147_483_646);
    const narrative = operation === "EDIT" ? text(input.narrative, 1, 8000) : undefined;
    const remarks = operation === "RETURN" ? text(input.remarks, 3, 1200) : null;
    return audited(actor, `NOTE_${operation}`, "ClinicalNote", id, () => clinicalTransaction(async (db, now) => {
      const note = await db.clinicalNote.findFirst({ where: { id, encounter: { caseId, careCase: { status: "OPEN" } } } });
      if (!note) unavailable();
      if (operation === "EDIT" || operation === "SUBMIT") {
        await requireAssignment(db, actor, caseId, operation === "EDIT" ? caseActions.noteWrite : caseActions.noteSubmit,
          now, note.assignmentId);
        if (note.authorId !== actor.accountId) unavailable();
      } else {
        await this.supervisor(db, actor, caseId, note,
          operation === "VALIDATE" ? caseActions.noteValidate : caseActions.noteReview, now);
      }
      if (note.status === "VALIDATED") conflict("NOTE_IMMUTABLE");
      if (note.version !== version) conflict("RECORD_VERSION_CHANGED");
      if (operation === "RETURN" ? note.status !== "IN_REVIEW" :
        operation !== "VALIDATE" && note.status !== "DRAFT" && note.status !== "RETURNED") conflict("NOTE_STATE_INVALID");
      const transitions = { EDIT: note.status, SUBMIT: "IN_REVIEW", RETURN: "RETURNED", VALIDATE: "VALIDATED" } as const;
      const status = transitions[operation];
      const saved = await db.clinicalNote.update({ where: { id, version },
        data: { ...(narrative === undefined ? {} : { narrative }), status, version: { increment: 1 },
          ...(status === "VALIDATED" ? { validatorId: actor.accountId, validatedAt: now } : {}) },
      });
      if (operation !== "EDIT") await db.noteReview.create({
        data: { noteId: id, actorId: actor.accountId, transition: status, version: saved.version, remarks },
      });
      await audit(db, actor, `NOTE_${operation}`, "ClinicalNote", id);
      return saved;
    }));
  }

  addendum(actor: ActorContext, caseId: string, id: string, body: unknown) {
    const input = object(body);
    const reason = text(input.reason, 3, 400);
    const narrative = text(input.narrative, 1, 8000);
    return audited(actor, "ADDENDUM_WRITE", "ClinicalNote", id, () => clinicalTransaction(async (db, now) => {
      await requireAssignment(db, actor, caseId, caseActions.addendumWrite, now);
      const note = await db.clinicalNote.findFirst({ where: { id, encounter: { caseId }, status: "VALIDATED" }, select: { id: true } });
      if (!note) unavailable();
      const added = await db.clinicalAddendum.create({ data: { noteId: id, authorId: actor.accountId, reason, narrative } });
      await audit(db, actor, "ADDENDUM_WRITE", "ClinicalAddendum", added.id);
      return added;
    }));
  }

  complete(actor: ActorContext, caseId: string, encounterId: string) {
    return audited(actor, "ENCOUNTER_COMPLETE", "Encounter", encounterId, () => clinicalTransaction(async (db, now) => {
      await requireAssignment(db, actor, caseId, caseActions.encounterOpen, now);
      const item = await db.encounter.findFirst({ where: { id: encounterId, caseId, professionalId: actor.accountId },
        include: { notes: { select: { status: true } } } });
      if (!item) unavailable();
      if (item.status === "COMPLETED") return item;
      if (!item.notes.length || item.notes.some(note => note.status !== "VALIDATED")) conflict("ENCOUNTER_REVIEW_PENDING");
      const saved = await db.encounter.update({ where: { id: encounterId }, data: { status: "COMPLETED", completedAt: now } });
      await audit(db, actor, "ENCOUNTER_COMPLETE", "Encounter", encounterId);
      return saved;
    }));
  }

}
