import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { activeAccount, capabilities, portalPatient, type ActorContext } from "@fbe/access-policy";
import { prisma, type Prisma } from "@fbe/database";
import { AccessPolicyService } from "../access/access-policy.service.js";
import { agendaTransaction } from "../agenda/agenda-transaction.js";
import { audited, audit, conflict, unavailable } from "../clinical/clinical-access.js";
import { decodeTextFile, discardPrivate, maxStoredBytes, readPrivate, sha256, storePrivate } from "../clinical/private-files.js";
import { choice, integer, invalid, object, text, uuid, type Input } from "../operations/input.js";
import { balance, bookingRoot, currentBooking, funds, maxMinor, scaledMinor, usd } from "./ledger.js";

const { financeRegister: register, financeVerify: verify, financeApprove: approve, financeExecute: execute } = capabilities;

const permissions = {
  OBLIGATION: register, DECLARE: register, VERIFY: verify, APPLY: verify,
  SOLIDARITY: register, SOLIDARITY_APPROVE: approve, REFUND: verify,
  REFUND_APPROVE: approve, REFUND_REJECT: approve, REFUND_EXECUTE: execute,
  SETTLEMENT: verify, SETTLEMENT_APPROVE: approve, SETTLEMENT_EXECUTE: execute,
} as const;
type Action = keyof typeof permissions;
const actions = Object.keys(permissions) as Action[];
const amount = (input: Input) => {
  if (input.currency !== usd) invalid("CURRENCY_INVALID");
  return integer(input.amountMinor, 1, maxMinor);
};
const amountId = (input: Input, field: string) => ({ value: amount(input), id: uuid(input[field]) });
const reason = (input: Input) => text(input.reason, 3, 160);

@Injectable()
export class EconomyService {
  constructor(private readonly policy: AccessPolicyService) {}

  private async caseFor(db: Prisma.TransactionClient, id: string) {
    const item = await db.obligation.findFirst({ where: { id, appointment: { careCase: { synthetic: true } } },
      select: { appointment: { select: { caseId: true } } } });
    if (!item) unavailable();
    return item.appointment.caseId;
  }

  async overview(actor: ActorContext) {
    return agendaTransaction(async (db, now) => {
      const staff = actor.capabilities.includes(register);
      const patient = actor.roleCodes.includes("PATIENT");
      const professional = actor.roleCodes.includes("PROFESSIONAL");
      if (!staff && !patient && !professional) unavailable();
      if (staff) await this.policy.requireCurrentCapability(db, actor, register, now);
      if (professional && !staff &&
          !await db.userAccount.findFirst({ where: { id: actor.accountId, ...activeAccount("PROFESSIONAL", now) } })) unavailable();
      const obligations = staff || patient ? await db.obligation.findMany({
        where: { appointment: { careCase: { synthetic: true, ...(staff ? {} : { participants: { some: {
          personId: actor.personId, kind: "PATIENT", portalAccess: true, startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        } } }) } } },
        select: { id: true, appointmentId: true, appointment: { select: {
          caseId: true, serviceName: true, careCase: { select: { referenceCode: true } },
        } } }, orderBy: { createdAt: "desc" }, take: 100,
      }) : [];
      const rows = [];
      for (const { id, appointmentId, appointment } of obligations) {
        if (!staff && !await portalPatient(db, actor, appointment.caseId, now)) continue;
        const leaf = await currentBooking(db, appointmentId);
        rows.push({ id, appointmentId: leaf.id, startsAt: leaf.startsAt, referenceCode: appointment.careCase.referenceCode,
          serviceName: appointment.serviceName, ...await balance(db, id) });
      }

      const receipts = staff || patient ? await db.moneyReceipt.findMany({
        where: staff ? {} : { payerId: actor.personId, obligationId: { in: rows.map(row => row.id) } },
        select: {
          id: true, obligationId: true, kind: true, amountMinor: true, currency: true, reference: true, verifiedAt: true,
          attachments: { select: { id: true, title: true } },
          applications: { where: staff ? {} : { obligationId: { in: rows.map(row => row.id) } },
            select: { id: true, obligationId: true, amountMinor: true } },
        }, orderBy: { createdAt: "desc" }, take: 100,
      }) : [];
      const settlements = staff || professional ? await db.settlement.findMany({
        where: staff ? {} : { professionalId: actor.accountId, stage: { in: ["APPROVED", "SIMULATED"] } },
        select: { id: true, professionalId: true, ruleVersion: true, basisPoints: true, netMinor: true, currency: true,
          stage: true, createdAt: true, lines: { select: { grossMinor: true, netMinor: true, refundId: true } } },
        orderBy: { createdAt: "desc" }, take: 100,
      }) : [];
      return { obligations: rows, receipts, settlements,
        awards: staff ? await db.solidarityAward.findMany({ take: 100, orderBy: { createdAt: "desc" } }) : [],
        refunds: staff ? await db.paymentRefund.findMany({ take: 100, orderBy: { createdAt: "desc" } }) : [],
        people: staff ? await db.person.findMany({ where: { synthetic: true, archivedAt: null },
          select: { id: true, displayName: true }, orderBy: { displayName: "asc" }, take: 100 }) : [],
        professionals: staff ? await db.userAccount.findMany({ where: activeAccount("PROFESSIONAL", now),
          select: { id: true, person: { select: { displayName: true } } }, take: 100 }) : [],
      };
    });
  }

  command(actor: ActorContext, value: unknown) {
    const input = object(value);
    const action = choice(input.action, actions);
    const key = uuid(input.requestId);
    const patientDeclaration = action === "DECLARE" && !actor.capabilities.includes(register);
    const fingerprint = createHash("sha256").update(JSON.stringify(Object.keys(input).sort().map(field => [field, input[field]]))).digest("hex");
    return agendaTransaction(async (db, now) => {
      if (patientDeclaration) {
        if (input.kind !== "PAYMENT" || input.payerId !== undefined ||
            !await portalPatient(db, actor, await this.caseFor(db, uuid(input.obligationId)), now)) unavailable();
      } else {
        await this.policy.requireCurrentCapability(db, actor, permissions[action], now);
      }
      const prior = await db.financeCommand.findUnique({ where: { actorId_key: { actorId: actor.accountId, key } } });
      if (prior) {
        if (prior.fingerprint !== fingerprint) conflict("REQUEST_ID_CONFLICT");
        return { id: prior.outcome };
      }
      const outcome = await this.applyCommand(db, actor, now, action, input, patientDeclaration);
      await db.financeCommand.create({ data: { actorId: actor.accountId, key, fingerprint, outcome } });
      await audit(db, actor, `FINANCE_${action}`, "FinancialMovement", outcome);
      return { id: outcome };
    });
  }

  private async applyCommand(db: Prisma.TransactionClient, { accountId, personId }: ActorContext, now: Date,
    action: Action, input: Input, patient: boolean): Promise<string> {
    switch (action) {
      case "OBLIGATION": {
        const rootId = await bookingRoot(db, uuid(input.appointmentId));
        const root = await db.appointment.findFirst({ where: { id: rootId, careCase: { synthetic: true },
          status: { in: ["CONFIRMED", "RESCHEDULED"] } } });
        if (!root) unavailable();
        const existing = await db.obligation.findUnique({ where: { appointmentId: rootId } });
        return existing?.id ?? (await db.obligation.create({ data: {
          appointmentId: rootId, amountMinor: root.amountMinor, currency: root.currency,
        } })).id;
      }
      case "DECLARE": {
        const kind = choice(input.kind, ["PAYMENT", "DONATION"]);
        const payerId = patient ? personId : uuid(input.payerId);
        if (!await db.person.findFirst({ where: { id: payerId, synthetic: true, archivedAt: null } })) unavailable();
        const obligationId = kind === "PAYMENT" ? uuid(input.obligationId) : null;
        if (obligationId) await this.caseFor(db, obligationId);
        const reference = text(input.reference, 5, 48).toUpperCase();
        if (!/^SYN-[A-Z0-9-]+$/.test(reference)) invalid("SYNTHETIC_REFERENCE_REQUIRED");
        const amountMinor = amount(input);
        if (await db.moneyReceipt.findUnique({ where: { reference } })) conflict("PAYMENT_REFERENCE_EXISTS");
        return (await db.moneyReceipt.create({ data: { obligationId, payerId, declaredById: accountId, kind,
          reference, amountMinor, currency: usd } })).id;
      }
      case "VERIFY": {
        if (input.confirmed !== true) invalid("FINANCE_CONFIRMATION_REQUIRED");
        const id = uuid(input.receiptId);
        const changed = await db.moneyReceipt.updateMany({
          where: { id, verifiedAt: null }, data: { verifiedAt: now, verifiedById: accountId },
        });
        if (changed.count !== 1) conflict("FINANCIAL_STATE_CHANGED");
        return id;
      }
      case "APPLY": {
        const { value, id: obligationId } = amountId(input, "obligationId");
        const receiptId = uuid(input.receiptId);
        const source = await funds(db, receiptId);
        const dest = await balance(db, obligationId);
        if (source.receipt.currency !== dest.currency) invalid("CURRENCY_INVALID");
        if (value > source.availableMinor || value > dest.dueMinor) conflict("FINANCIAL_BALANCE_EXCEEDED");
        return (await db.paymentApplication.create({ data: { obligationId, receiptId, actorId: accountId, amountMinor: value } })).id;
      }
      case "SOLIDARITY": {
        const { value, id: obligationId } = amountId(input, "obligationId");
        if (value > (await balance(db, obligationId)).dueMinor) conflict("FINANCIAL_BALANCE_EXCEEDED");
        return (await db.solidarityAward.create({ data: { obligationId, amountMinor: value,
          kind: choice(input.kind, ["SCHOLARSHIP", "DISCOUNT", "WAIVER"]), reason: reason(input), proposedById: accountId } })).id;
      }
      case "SOLIDARITY_APPROVE": {
        const id = uuid(input.awardId);
        const award = await db.solidarityAward.findUnique({ where: { id } });
        if (!award || award.approvedAt) conflict("FINANCIAL_STATE_CHANGED");
        if (award.amountMinor > (await balance(db, award.obligationId)).dueMinor) conflict("FINANCIAL_BALANCE_EXCEEDED");
        await db.solidarityAward.update({ where: { id }, data: { approvedById: accountId, approvedAt: now } });
        return id;
      }
      case "REFUND": {
        const { value, id: receiptId } = amountId(input, "receiptId");
        const source = await funds(db, receiptId);
        const applicationId = input.applicationId ? uuid(input.applicationId) : null;
        let eligible = source.availableMinor;
        if (applicationId) {
          const application = await db.paymentApplication.findFirst({ where: { id: applicationId, receiptId },
            include: { refunds: { where: { stage: { not: "REJECTED" } }, select: { amountMinor: true } } } });
          if (!application) unavailable();
          eligible = application.amountMinor - application.refunds.reduce((sum, item) => sum + item.amountMinor, 0);
        }
        if (value > eligible) conflict("FINANCIAL_BALANCE_EXCEEDED");
        return (await db.paymentRefund.create({ data: { receiptId, applicationId, amountMinor: value,
          preparedById: accountId, reason: reason(input) } })).id;
      }
      case "SETTLEMENT":
        return this.prepareSettlement(db, accountId, now, uuid(input.professionalId), integer(input.basisPoints, 0, 10_000));
      case "REFUND_APPROVE":
      case "REFUND_REJECT":
      case "REFUND_EXECUTE":
      case "SETTLEMENT_APPROVE":
      case "SETTLEMENT_EXECUTE": {
        const refund = action.startsWith("REFUND");
        const id = uuid(refund ? input.refundId : input.settlementId);
        const running = action.endsWith("_EXECUTE");
        const where = { id, stage: running ? "APPROVED" as const : "PREPARED" as const };
        const data = running ? { stage: "SIMULATED" as const, executedAt: now, executedById: accountId } :
          { stage: action.endsWith("_REJECT") ? "REJECTED" as const : "APPROVED" as const, decidedAt: now, decidedById: accountId };
        const changed = refund ? await db.paymentRefund.updateMany({ where, data }) : await db.settlement.updateMany({ where, data });
        if (changed.count !== 1) conflict("FINANCIAL_STATE_CHANGED");
        return id;
      }
    }
  }

  private async prepareSettlement(db: Prisma.TransactionClient, accountId: string, now: Date, professionalId: string, basisPoints: number) {
    if (!await db.userAccount.findFirst({ where: { id: professionalId, ...activeAccount("PROFESSIONAL", now) } })) unavailable();
    const applications = await db.paymentApplication.findMany({ where: { settlementLine: null },
      select: { id: true, amountMinor: true, obligation: { select: { appointmentId: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const lines: Prisma.SettlementLineUncheckedCreateWithoutSettlementInput[] = [];
    const included = new Set<string>();
    for (const item of applications) {
      const appointment = await currentBooking(db, item.obligation.appointmentId);
      if (appointment.professionalId !== professionalId || appointment.attendance !== "ATTENDED") continue;
      included.add(item.id);
      lines.push({ applicationId: item.id, grossMinor: item.amountMinor, netMinor: scaledMinor(item.amountMinor, basisPoints) });
    }
    const refunds = await db.paymentRefund.findMany({ where: { stage: "SIMULATED", applicationId: { not: null } },
      include: { settlementLine: { select: { id: true } }, application: { select: {
        settlementLine: { select: { settlement: { select: { professionalId: true, stage: true, basisPoints: true } } } },
      } } }, orderBy: [{ executedAt: "asc" }, { id: "asc" }] });
    // Refunds reverse the rule of the original line, including across payout periods.
    const offsets = new Map<string, number>();
    for (const refund of refunds) {
      const applicationId = refund.applicationId!;
      const already = offsets.get(applicationId) ?? 0;
      offsets.set(applicationId, already + refund.amountMinor);
      const original = refund.application?.settlementLine?.settlement;
      const rate = included.has(applicationId) ? basisPoints :
        original?.professionalId === professionalId && original.stage === "SIMULATED" ? original.basisPoints : undefined;
      if (refund.settlementLine || rate === undefined) continue;
      lines.push({ refundId: refund.id, grossMinor: -refund.amountMinor,
        netMinor: scaledMinor(already, rate) - scaledMinor(already + refund.amountMinor, rate) });
    }
    if (!lines.length) conflict("SETTLEMENT_EMPTY");
    const netMinor = lines.reduce((sum, line) => sum + line.netMinor, 0);
    if (Math.abs(netMinor) > maxMinor) conflict("SETTLEMENT_LIMIT");
    return (await db.settlement.create({ data: {
      professionalId, preparedById: accountId, basisPoints, ruleVersion: "SYNTHETIC_NET_V1", netMinor, currency: usd,
      lines: { create: lines },
    } })).id;
  }

  private async authorizeEvidence(db: Prisma.TransactionClient, actor: ActorContext, now: Date, receiptId: string) {
    const receipt = await db.moneyReceipt.findUnique({ where: { id: receiptId } });
    if (!receipt) unavailable();
    if (actor.capabilities.includes(register)) {
      await this.policy.requireCurrentCapability(db, actor, register, now);
    } else if (!receipt.obligationId || receipt.payerId !== actor.personId ||
      !await portalPatient(db, actor, await this.caseFor(db, receipt.obligationId), now)) unavailable();
    return receipt;
  }

  evidence(actor: ActorContext, receiptId: string, value: unknown) {
    const input = object(value);
    const key = uuid(input.requestId);
    const document = decodeTextFile(input);
    const title = text(input.title, 3, 140);
    const digest = sha256(document);
    const fingerprint = sha256(Buffer.from(JSON.stringify({ receiptId, title, digest })));
    const storageKey = randomUUID();
    let attempted = false;
    return audited(actor, "PAYMENT_EVIDENCE_UPLOAD", "MoneyReceipt", receiptId, async () => {
      try {
        return await agendaTransaction(async (db, now) => {
          await db.$executeRaw`SELECT pg_advisory_xact_lock(614023008)`;
          const receipt = await this.authorizeEvidence(db, actor, now, receiptId);
          const prior = await db.financeCommand.findUnique({ where: { actorId_key: { actorId: actor.accountId, key } } });
          if (prior) {
            if (prior.fingerprint !== fingerprint) conflict("REQUEST_ID_CONFLICT");
            return { id: prior.outcome };
          }
          if (receipt.verifiedAt) conflict("FINANCIAL_STATE_CHANGED");
          const total = await db.privateAttachment.aggregate({ _sum: { bytes: true } });
          if ((total._sum.bytes ?? 0) + document.length > maxStoredBytes) conflict("SYNTHETIC_ATTACHMENT_BUDGET");
          attempted = true;
          await storePrivate(storageKey, document);
          const file = await db.privateAttachment.create({ data: {
            receiptId, kind: "PAYMENT_EVIDENCE", createdById: actor.accountId, title, storageKey,
            sha256: digest, bytes: document.length, mediaType: "text/plain",
          }, select: { id: true } });
          await db.financeCommand.create({ data: { actorId: actor.accountId, key, fingerprint, outcome: file.id } });
          await audit(db, actor, "PAYMENT_EVIDENCE_UPLOAD", "PrivateAttachment", file.id);
          return file;
        });
      } catch (error) {
        if (attempted && await prisma.privateAttachment.findUnique({ where: { storageKey } }).catch(() => undefined) === null) {
          await discardPrivate(storageKey);
        }
        throw error;
      }
    });
  }

  download(actor: ActorContext, id: string) {
    return audited(actor, "PAYMENT_EVIDENCE_DOWNLOAD", "PrivateAttachment", id, () => agendaTransaction(async (db, now) => {
      const file = await db.privateAttachment.findFirst({ where: { id, kind: "PAYMENT_EVIDENCE" } });
      if (!file?.receiptId) unavailable();
      await this.authorizeEvidence(db, actor, now, file.receiptId);
      const content = await readPrivate(file);
      await audit(db, actor, "PAYMENT_EVIDENCE_DOWNLOAD", "PrivateAttachment", id);
      return content;
    }));
  }
}
