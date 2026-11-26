import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { caseActions, clinicalAssignment, portalPatient, type ActorContext } from "@fbe/access-policy";
import { prisma, type Prisma } from "@fbe/database";
import { object, text, uuid } from "../operations/input.js";
import { audit, audited, clinicalTransaction, conflict, requireAssignment, unavailable } from "./clinical-access.js";
import { casePatient } from "./consents.service.js";
import { decodeTextFile, discardPrivate, maxStoredBytes, readPrivate, sha256, storePrivate } from "./private-files.js";
import { PracticesService } from "./practices.service.js";

const fileDetails = {
  id: true, kind: true, version: true, title: true, bytes: true, mediaType: true,
  createdAt: true, consentId: true, previousId: true,
  share: { select: { sharedAt: true, sharedById: true } },
} as const;

type Owner = { caseId: string; practiceId?: never } | { practiceId: string; caseId?: never };

@Injectable()
export class DocumentsService {
  constructor(private readonly practices: PracticesService) {}

  async list(actor: ActorContext, owner: Owner) {
    const id = owner.caseId ?? owner.practiceId;
    return audited(actor, "ATTACHMENT_LIST", "AttachmentOwner", id, () => clinicalTransaction(async (db, now) => {
      let patientScope: Prisma.PrivateAttachmentWhereInput = {};
      if (owner.caseId) {
        if (!await clinicalAssignment(db, actor, owner.caseId, caseActions.attachmentRead, now)) {
          if (!await portalPatient(db, actor, owner.caseId, now)) unavailable();
          patientScope = { kind: "CASE_DOCUMENT", share: { personId: actor.personId } };
        }
      } else {
        await this.practices.member(db, actor, id, now);
      }
      const files = await db.privateAttachment.findMany({
        where: { ...owner, ...patientScope }, select: fileDetails, orderBy: { createdAt: "desc" }, take: 120,
      });
      await audit(db, actor, "ATTACHMENT_LIST", "AttachmentOwner", id);
      return files;
    }));
  }

  upload(actor: ActorContext, owner: Owner, body: unknown) {
    const input = object(body);
    const document = decodeTextFile(input);
    const title = text(input.title, 3, 140);
    const previousId = input.previousId ? uuid(input.previousId) : null;
    const consentId = input.consentId ? uuid(input.consentId) : null;
    const kind = owner.practiceId ? "PRACTICE_DOCUMENT" : consentId ? "CONSENT_EVIDENCE" : "CASE_DOCUMENT";
    const id = owner.caseId ?? owner.practiceId;
    const storageKey = randomUUID();
    let storageAttempted = false;
    return audited(actor, "ATTACHMENT_UPLOAD", "AttachmentOwner", id, async () => {
      try {
        return await clinicalTransaction(async (db, now) => {
          if (owner.caseId) {
            await requireAssignment(db, actor, owner.caseId, consentId ? caseActions.consentManage : caseActions.attachmentWrite, now);
            if (consentId && !(await db.consentRecord.findFirst({ where: { id: consentId, caseId: owner.caseId },
              select: { id: true } }))) unavailable();
          } else {
            if (consentId) unavailable();
            await this.practices.member(db, actor, id, now);
          }
          const prior = previousId && await db.privateAttachment.findFirst({ where: {
            ...owner, id: previousId, kind, consentId, replacement: null,
          }, select: { version: true } });
          if (previousId && !prior) conflict("ATTACHMENT_VERSION_CHANGED");
          const sizes = await db.privateAttachment.aggregate({ _sum: { bytes: true } });
          if ((sizes._sum.bytes ?? 0) + document.length > maxStoredBytes) conflict("SYNTHETIC_ATTACHMENT_BUDGET");
          storageAttempted = true;
          await storePrivate(storageKey, document);
          const item = await db.privateAttachment.create({ data: {
            ...owner, kind, consentId, createdById: actor.accountId, previousId, version: prior ? prior.version + 1 : 1,
            title, storageKey, bytes: document.length, sha256: sha256(document), mediaType: "text/plain",
          }, select: fileDetails });
          await audit(db, actor, "ATTACHMENT_UPLOAD", "PrivateAttachment", item.id);
          return item;
        });
      } catch (error) {
        if (storageAttempted) {
          // After an uncertain commit, keep the file unless PostgreSQL confirms no row.
          const stored = await prisma.privateAttachment.findUnique({ where: { storageKey },
            select: { id: true } }).catch(() => undefined);
          if (stored === null) await discardPrivate(storageKey);
        }
        throw error;
      }
    });
  }

  download(actor: ActorContext, id: string) {
    return audited(actor, "ATTACHMENT_DOWNLOAD", "PrivateAttachment", id, () => clinicalTransaction(async (db, now) => {
      const file = await db.privateAttachment.findUnique({ where: { id }, include: { share: true } });
      if (!file) unavailable();
      if (file.practiceId) await this.practices.member(db, actor, file.practiceId, now);
      else if (file.caseId) {
        const staff = await clinicalAssignment(db, actor, file.caseId, caseActions.attachmentRead, now);
        if (!staff && !(file.kind === "CASE_DOCUMENT" && file.share?.personId === actor.personId &&
            await portalPatient(db, actor, file.caseId, now))) unavailable();
      } else unavailable();
      const content = await readPrivate(file);
      await audit(db, actor, "ATTACHMENT_DOWNLOAD", "PrivateAttachment", id);
      return content;
    }));
  }

  private async publish(db: Prisma.TransactionClient, actor: ActorContext, caseId: string, id: string,
    personId: string, now: Date) {
    await requireAssignment(db, actor, caseId, caseActions.attachmentShare, now);
    if (personId !== await casePatient(db, caseId, now)) unavailable();
    const file = await db.privateAttachment.findFirst({ where: { id, caseId, kind: "CASE_DOCUMENT" }, include: { share: true } });
    if (!file || (file.share && file.share.personId !== personId)) unavailable();
    if (file.share) return file.share;
    const share = await db.attachmentShare.create({ data: { attachmentId: id, personId, sharedById: actor.accountId } });
    await audit(db, actor, "ATTACHMENT_SHARE", "PrivateAttachment", id);
    return share;
  }

  share(actor: ActorContext, caseId: string, id: string, body: unknown) {
    if (object(body).reviewed !== true) conflict("DOCUMENT_REVIEW_REQUIRED");
    return audited(actor, "ATTACHMENT_SHARE", "PrivateAttachment", id, () => clinicalTransaction(async (db, now) => {
      return this.publish(db, actor, caseId, id, await casePatient(db, caseId, now), now);
    }));
  }

  requests(actor: ActorContext, caseId: string) {
    return audited(actor, "INFORMATION_LIST", "CareCase", caseId, () => clinicalTransaction(async (db, now) => {
      const patient = await portalPatient(db, actor, caseId, now);
      if (!patient) await requireAssignment(db, actor, caseId, caseActions.informationHandle, now);
      return db.informationRequest.findMany({ where: {
        caseId, ...(patient ? { requesterId: actor.personId } : {}),
      }, orderBy: { initiatedAt: "desc" }, take: 80 });
    }));
  }

  request(actor: ActorContext, caseId: string, body: unknown) {
    const scope = text(object(body).scope, 4, 300);
    return audited(actor, "INFORMATION_REQUEST", "CareCase", caseId, () => clinicalTransaction(async (db, now) => {
      if (!await portalPatient(db, actor, caseId, now)) unavailable();
      const item = await db.informationRequest.create({ data: { caseId, requesterId: actor.personId, scope } });
      await audit(db, actor, "INFORMATION_REQUEST", "InformationRequest", item.id);
      return item;
    }));
  }

  advance(actor: ActorContext, caseId: string, id: string, body: unknown) {
    const input = object(body);
    return audited(actor, "INFORMATION_PROGRESS", "InformationRequest", id, () => clinicalTransaction(async (db, now) => {
      await requireAssignment(db, actor, caseId, caseActions.informationHandle, now);
      const item = await db.informationRequest.findFirst({ where: { id, caseId } });
      if (!item) unavailable();
      if (item.status === "REQUESTED" && input.operation === "VERIFY" && input.identityChecked === true) {
        const personId = await casePatient(db, caseId, now);
        if (item.requesterId !== personId) unavailable();
        await audit(db, actor, "INFORMATION_IDENTITY_CHECKED", "InformationRequest", id);
        return db.informationRequest.update({ where: { id }, data: {
          handlerId: actor.accountId, status: "VERIFIED", verifiedAt: now,
        } });
      }
      if (item.handlerId && item.handlerId !== actor.accountId) unavailable();
      if (item.status === "VERIFIED" && input.operation === "REVIEW" && input.thirdPartyReviewed === true) {
        await audit(db, actor, "INFORMATION_REVIEWED", "InformationRequest", id);
        return db.informationRequest.update({ where: { id }, data: {
          status: "REVIEWED", reviewedAt: now, thirdPartyReviewed: true,
        } });
      }
      if (item.status === "REVIEWED" && item.thirdPartyReviewed && input.operation === "DELIVER") {
        const share = await this.publish(db, actor, caseId, uuid(input.attachmentId), item.requesterId, now);
        await audit(db, actor, "INFORMATION_DELIVERED", "InformationRequest", id);
        return db.informationRequest.update({ where: { id }, data: {
          attachmentId: share.attachmentId, deliveredAt: now, status: "DELIVERED",
        } });
      }
      conflict("INFORMATION_STATE_INVALID");
    }));
  }
}
