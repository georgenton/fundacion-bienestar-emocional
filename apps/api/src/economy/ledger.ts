import { type Prisma } from "@fbe/database";
import { conflict, unavailable } from "../clinical/clinical-access.js";

export const maxMinor = 100_000_000;
export const usd = "USD";

export async function bookingRoot(db: Prisma.TransactionClient, appointmentId: string) {
  const [root] = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE lineage AS (
      SELECT id, "previousId" FROM "Appointment" WHERE id=${appointmentId}::uuid
      UNION ALL
      SELECT a.id, a."previousId" FROM "Appointment" a JOIN lineage l ON a.id=l."previousId"
    )
    SELECT id FROM lineage WHERE "previousId" IS NULL
  `;
  if (!root) unavailable();
  return root.id;
}

export async function currentBooking(db: Prisma.TransactionClient, rootId: string) {
  const [leaf] = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE lineage AS (
      SELECT id FROM "Appointment" WHERE id=${rootId}::uuid
      UNION ALL SELECT a.id FROM "Appointment" a JOIN lineage l ON a."previousId"=l.id
    )
    SELECT l.id FROM lineage l WHERE NOT EXISTS (SELECT FROM "Appointment" a WHERE a."previousId"=l.id)
  `;
  if (!leaf) unavailable();
  return db.appointment.findUniqueOrThrow({ where: { id: leaf.id } });
}

export async function balance(db: Prisma.TransactionClient, obligationId: string) {
  const row = await db.obligation.findUnique({
    where: { id: obligationId },
    include: {
      solidarity: { where: { approvedAt: { not: null } }, select: { amountMinor: true } },
      applications: { select: { amountMinor: true, refunds: {
        where: { stage: "SIMULATED" }, select: { amountMinor: true },
      } } },
    },
  });
  if (!row) unavailable();
  const solidarityMinor = row.solidarity.reduce((sum, item) => sum + item.amountMinor, 0);
  const appliedMinor = row.applications.reduce((sum, item) =>
    sum + item.amountMinor - item.refunds.reduce((refunded, item) => refunded + item.amountMinor, 0), 0);
  return { amountMinor: row.amountMinor, currency: row.currency, solidarityMinor, appliedMinor,
    dueMinor: row.amountMinor - solidarityMinor - appliedMinor };
}

export async function funds(db: Prisma.TransactionClient, receiptId: string) {
  const receipt = await db.moneyReceipt.findUnique({ where: { id: receiptId } });
  if (!receipt) unavailable();
  if (receipt.kind !== "PAYMENT" || !receipt.verifiedAt) conflict("VERIFIED_PAYMENT_REQUIRED");
  const [applied, returned] = await Promise.all([
    db.paymentApplication.aggregate({ where: { receiptId }, _sum: { amountMinor: true } }),
    db.paymentRefund.aggregate({ where: { receiptId, applicationId: null, stage: { not: "REJECTED" } },
      _sum: { amountMinor: true } }),
  ]);
  return { receipt, availableMinor: receipt.amountMinor - (applied._sum.amountMinor ?? 0) - (returned._sum.amountMinor ?? 0) };
}

// Half-up per underlying application. Refund portions use differences between
// rounded cumulative totals so a full refund reverses precisely what accrued.
export function scaledMinor(value: number, basisPoints: number) {
  return Number((BigInt(value) * BigInt(basisPoints) + 5_000n) / 10_000n);
}
