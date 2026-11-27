-- CreateEnum
CREATE TYPE "ReceiptKind" AS ENUM ('PAYMENT', 'DONATION');

-- CreateEnum
CREATE TYPE "FinancialStage" AS ENUM ('PREPARED', 'APPROVED', 'SIMULATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SolidarityKind" AS ENUM ('SCHOLARSHIP', 'DISCOUNT', 'WAIVER');

-- CreateEnum
CREATE TYPE "ReminderState" AS ENUM ('READY', 'SKIPPED', 'DELIVERED');

-- AlterEnum
ALTER TYPE "AttachmentClass" ADD VALUE 'PAYMENT_EVIDENCE';

-- AlterTable
ALTER TABLE "PrivateAttachment" ADD COLUMN     "receiptId" UUID;

-- CreateTable
CREATE TABLE "Obligation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appointmentId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyReceipt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "obligationId" UUID,
    "payerId" UUID NOT NULL,
    "declaredById" UUID NOT NULL,
    "verifiedById" UUID,
    "kind" "ReceiptKind" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MoneyReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentApplication" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receiptId" UUID NOT NULL,
    "obligationId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolidarityAward" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "obligationId" UUID NOT NULL,
    "proposedById" UUID NOT NULL,
    "approvedById" UUID,
    "amountMinor" INTEGER NOT NULL,
    "kind" "SolidarityKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "SolidarityAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRefund" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receiptId" UUID NOT NULL,
    "applicationId" UUID,
    "preparedById" UUID NOT NULL,
    "decidedById" UUID,
    "executedById" UUID,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "stage" "FinancialStage" NOT NULL DEFAULT 'PREPARED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),
    "executedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "professionalId" UUID NOT NULL,
    "preparedById" UUID NOT NULL,
    "decidedById" UUID,
    "executedById" UUID,
    "ruleVersion" TEXT NOT NULL,
    "basisPoints" INTEGER NOT NULL,
    "netMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "stage" "FinancialStage" NOT NULL DEFAULT 'PREPARED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),
    "executedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "settlementId" UUID NOT NULL,
    "applicationId" UUID,
    "refundId" UUID,
    "grossMinor" INTEGER NOT NULL,
    "netMinor" INTEGER NOT NULL,

    CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCommand" (
    "actorId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "outcome" UUID NOT NULL,

    CONSTRAINT "FinanceCommand_pkey" PRIMARY KEY ("actorId","key")
);

-- CreateTable
CREATE TABLE "ReminderPreference" (
    "accountId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReminderPreference_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "ReminderJob" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appointmentId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "appointmentVersion" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "attemptedAt" TIMESTAMPTZ(3),
    "state" "ReminderState" NOT NULL DEFAULT 'READY',

    CONSTRAINT "ReminderJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderDelivery" (
    "jobId" UUID NOT NULL,
    "deliveredAt" TIMESTAMPTZ(3) NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "ReminderDelivery_pkey" PRIMARY KEY ("jobId")
);

-- CreateTable
CREATE TABLE "VideoMeeting" (
    "appointmentId" UUID NOT NULL,
    "appointmentVersion" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedLink" TEXT NOT NULL,
    "linkDigest" TEXT NOT NULL,
    "managedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalClosedAt" TIMESTAMPTZ(3),
    "externalClosedById" UUID,

    CONSTRAINT "VideoMeeting_pkey" PRIMARY KEY ("appointmentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Obligation_appointmentId_key" ON "Obligation"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyReceipt_reference_key" ON "MoneyReceipt"("reference");

-- CreateIndex
CREATE INDEX "MoneyReceipt_payerId_idx" ON "MoneyReceipt"("payerId");

-- CreateIndex
CREATE INDEX "PaymentApplication_receiptId_idx" ON "PaymentApplication"("receiptId");

-- CreateIndex
CREATE INDEX "PaymentApplication_obligationId_idx" ON "PaymentApplication"("obligationId");

-- CreateIndex
CREATE INDEX "SolidarityAward_obligationId_idx" ON "SolidarityAward"("obligationId");

-- CreateIndex
CREATE INDEX "PaymentRefund_receiptId_applicationId_idx" ON "PaymentRefund"("receiptId", "applicationId");

-- CreateIndex
CREATE INDEX "Settlement_professionalId_idx" ON "Settlement"("professionalId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementLine_applicationId_key" ON "SettlementLine"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementLine_refundId_key" ON "SettlementLine"("refundId");

-- CreateIndex
CREATE INDEX "ReminderJob_state_scheduledAt_idx" ON "ReminderJob"("state", "scheduledAt");

-- CreateIndex
CREATE INDEX "ReminderJob_accountId_idx" ON "ReminderJob"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderJob_appointmentId_accountId_appointmentVersion_key" ON "ReminderJob"("appointmentId", "accountId", "appointmentVersion");

-- CreateIndex
CREATE UNIQUE INDEX "VideoMeeting_linkDigest_key" ON "VideoMeeting"("linkDigest");

-- AddForeignKey
ALTER TABLE "PrivateAttachment" ADD CONSTRAINT "PrivateAttachment_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "MoneyReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyReceipt" ADD CONSTRAINT "MoneyReceipt_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyReceipt" ADD CONSTRAINT "MoneyReceipt_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentApplication" ADD CONSTRAINT "PaymentApplication_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "MoneyReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentApplication" ADD CONSTRAINT "PaymentApplication_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolidarityAward" ADD CONSTRAINT "SolidarityAward_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "MoneyReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "PaymentApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "PaymentApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "PaymentRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCommand" ADD CONSTRAINT "FinanceCommand_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderPreference" ADD CONSTRAINT "ReminderPreference_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderJob" ADD CONSTRAINT "ReminderJob_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderJob" ADD CONSTRAINT "ReminderJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ReminderJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoMeeting" ADD CONSTRAINT "VideoMeeting_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "PrivateAttachment" DROP CONSTRAINT "PrivateAttachment_check";
ALTER TABLE "PrivateAttachment" ADD CONSTRAINT private_attachment_owner CHECK (
  "bytes" BETWEEN 1 AND 16384 AND "version" > 0 AND "sha256" ~ '^[a-f0-9]{64}$' AND "mediaType" = 'text/plain' AND (
  ("kind"::text = 'PAYMENT_EVIDENCE' AND "receiptId" IS NOT NULL AND "caseId" IS NULL AND "practiceId" IS NULL AND "consentId" IS NULL) OR
  ("receiptId" IS NULL AND (
  ("kind" = 'PRACTICE_DOCUMENT' AND "practiceId" IS NOT NULL AND "caseId" IS NULL AND "consentId" IS NULL) OR
  ("kind" = 'CASE_DOCUMENT' AND "practiceId" IS NULL AND "caseId" IS NOT NULL AND "consentId" IS NULL) OR
  ("kind" = 'CONSENT_EVIDENCE' AND "practiceId" IS NULL AND "caseId" IS NOT NULL AND "consentId" IS NOT NULL)
  )))
);
ALTER TABLE "Obligation" ADD CHECK ("amountMinor" BETWEEN 0 AND 100000000 AND currency='USD');
ALTER TABLE "MoneyReceipt" ADD CHECK ("amountMinor" BETWEEN 1 AND 100000000 AND currency='USD'
  AND (("kind"='PAYMENT') = ("obligationId" IS NOT NULL))
  AND (("verifiedAt" IS NULL) = ("verifiedById" IS NULL)));
ALTER TABLE "PaymentApplication" ADD CHECK ("amountMinor" BETWEEN 1 AND 100000000);
ALTER TABLE "SolidarityAward" ADD CHECK ("amountMinor" BETWEEN 1 AND 100000000 AND (("approvedAt" IS NULL) = ("approvedById" IS NULL)));
ALTER TABLE "PaymentRefund" ADD CHECK ("amountMinor" BETWEEN 1 AND 100000000);
ALTER TABLE "Settlement" ADD CHECK ("basisPoints" BETWEEN 0 AND 10000 AND currency='USD');
ALTER TABLE "SettlementLine" ADD CHECK (("applicationId" IS NULL) <> ("refundId" IS NULL));
ALTER TABLE "VideoMeeting" ADD CHECK (provider='GOOGLE_MEET');

INSERT INTO "Role" (code, description, "isStaff", "isClinical") VALUES
  ('FINANCE','Operación económica sintética',true,false) ON CONFLICT (code) DO NOTHING;
INSERT INTO "Capability" (code,description) VALUES
  ('finance:register','Obligaciones y declaraciones de prueba'),
  ('finance:verify','Conciliación y aplicación de prueba'),
  ('finance:approve','Aprobación de operaciones de prueba'),
  ('finance:execute','Confirmación manual de simulación'),
  ('finance:grant','Invitación a la función financiera')
  ON CONFLICT (code) DO NOTHING;
INSERT INTO "RoleCapability" ("roleId","capabilityId")
SELECT r.id,c.id FROM "Role" r CROSS JOIN "Capability" c WHERE
  (r.code='FINANCE' AND c.code IN ('finance:register','finance:verify','finance:approve','finance:execute'))
  OR (r.code='RECEPTION' AND c.code='finance:register')
  OR (r.code='OPERATIONS_ADMIN' AND c.code='finance:grant')
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='fbe_runtime') THEN
    REVOKE ALL ON "Obligation","MoneyReceipt","PaymentApplication","SolidarityAward","PaymentRefund","Settlement",
      "SettlementLine","FinanceCommand","ReminderPreference","ReminderJob","ReminderDelivery","VideoMeeting" FROM fbe_runtime;
    GRANT SELECT,INSERT ON "Obligation","MoneyReceipt","PaymentApplication","SolidarityAward","PaymentRefund","Settlement",
      "SettlementLine","FinanceCommand","ReminderPreference","ReminderJob","ReminderDelivery","VideoMeeting" TO fbe_runtime;
    GRANT UPDATE ("verifiedAt","verifiedById") ON "MoneyReceipt" TO fbe_runtime;
    GRANT UPDATE ("approvedAt","approvedById") ON "SolidarityAward" TO fbe_runtime;
    GRANT UPDATE (stage,"decidedAt","decidedById","executedAt","executedById") ON "PaymentRefund","Settlement" TO fbe_runtime;
    GRANT UPDATE (enabled,"updatedAt") ON "ReminderPreference" TO fbe_runtime;
    GRANT UPDATE (state,"attemptedAt") ON "ReminderJob" TO fbe_runtime;
    GRANT UPDATE ("externalClosedAt","externalClosedById") ON "VideoMeeting" TO fbe_runtime;
  END IF;
END $$;
