BEGIN;

-- CreateEnum
CREATE TYPE "AppointmentModality" AS ENUM ('IN_PERSON', 'ONLINE');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('HELD', 'CONFIRMED', 'EXPIRED', 'RESCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('UNRECORDED', 'ATTENDED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "CancellationParty" AS ENUM ('PATIENT', 'PROFESSIONAL', 'ADMINISTRATIVE');

-- DropIndex
DROP INDEX "Person_contactEmail_key";

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AccountInvitation" ADD COLUMN     "personId" UUID;

-- AlterTable
ALTER TABLE "CareCase" ADD COLUMN     "modality" "AppointmentModality",
ADD COLUMN     "serviceId" UUID;

-- CreateTable
CREATE TABLE "ServiceDefinition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "modalities" "AppointmentModality"[] NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "marginMinutes" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceProfessional" (
    "serviceId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ServiceProfessional_pkey" PRIMARY KEY ("serviceId","professionalId")
);

-- CreateTable
CREATE TABLE "ProfessionalHours" (
    "professionalId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opensMinute" INTEGER NOT NULL,
    "closesMinute" INTEGER NOT NULL,

    CONSTRAINT "ProfessionalHours_pkey" PRIMARY KEY ("professionalId","weekday")
);

-- CreateTable
CREATE TABLE "ProfessionalAbsence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "professionalId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProfessionalAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTariff" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "serviceId" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ServiceTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "createdByAccountId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "tariffId" UUID NOT NULL,
    "serviceName" TEXT NOT NULL,
    "modality" "AppointmentModality" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "occupiedUntil" TIMESTAMPTZ(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "marginMinutes" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "holdExpiresAt" TIMESTAMPTZ(3),
    "status" "AppointmentStatus" NOT NULL DEFAULT 'HELD',
    "attendance" "AttendanceStatus" NOT NULL DEFAULT 'UNRECORDED',
    "cancellationParty" "CancellationParty",
    "changeReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaRequest" (
    "actorId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaRequest_pkey" PRIMARY KEY ("actorId","key")
);

-- CreateIndex
CREATE INDEX "ProfessionalAbsence_professionalId_startsAt_idx" ON "ProfessionalAbsence"("professionalId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTariff_serviceId_startsAt_key" ON "ServiceTariff"("serviceId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_previousId_key" ON "Appointment"("previousId");

-- CreateIndex
CREATE INDEX "Appointment_professionalId_startsAt_idx" ON "Appointment"("professionalId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_caseId_startsAt_idx" ON "Appointment"("caseId", "startsAt");

-- CreateIndex
CREATE INDEX "Person_contactEmail_idx" ON "Person"("contactEmail");

-- CreateIndex
CREATE INDEX "AccountInvitation_personId_idx" ON "AccountInvitation"("personId");

-- AddForeignKey
ALTER TABLE "AccountInvitation" ADD CONSTRAINT "AccountInvitation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareCase" ADD CONSTRAINT "CareCase_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceProfessional" ADD CONSTRAINT "ServiceProfessional_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceProfessional" ADD CONSTRAINT "ServiceProfessional_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalHours" ADD CONSTRAINT "ProfessionalHours_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalAbsence" ADD CONSTRAINT "ProfessionalAbsence_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTariff" ADD CONSTRAINT "ServiceTariff_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CareCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdByAccountId_fkey" FOREIGN KEY ("createdByAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "ServiceTariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_previousId_fkey" FOREIGN KEY ("previousId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaRequest" ADD CONSTRAINT "AgendaRequest_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Use absolute instants and half-open occupied intervals, including the trailing margin.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "CareCase" ADD CONSTRAINT "care_case_service_modality_pair"
  CHECK (("serviceId" IS NULL) = ("modality" IS NULL));

ALTER TABLE "ServiceDefinition" ADD CONSTRAINT "valid_service_terms"
  CHECK ("durationMinutes" BETWEEN 5 AND 240 AND "marginMinutes" BETWEEN 0 AND 120
     AND (NOT "enabled" OR cardinality("modalities") > 0));

ALTER TABLE "ServiceTariff" ADD CONSTRAINT "valid_service_tariff"
  CHECK ("amountMinor" >= 0 AND "currency" ~ '^[A-Z]{3}$');

ALTER TABLE "ProfessionalHours" ADD CONSTRAINT "valid_professional_hours"
  CHECK ("weekday" BETWEEN 1 AND 7 AND "opensMinute" >= 0 AND "closesMinute" <= 1440
     AND "opensMinute" < "closesMinute");

ALTER TABLE "ProfessionalAbsence" ADD CONSTRAINT "valid_professional_absence"
  CHECK ("startsAt" < "endsAt");

ALTER TABLE "Appointment" ADD CONSTRAINT "valid_appointment_snapshot"
  CHECK ("durationMinutes" BETWEEN 5 AND 240 AND "marginMinutes" BETWEEN 0 AND 120
     AND "endsAt" = "startsAt" + "durationMinutes" * interval '1 minute'
     AND "occupiedUntil" = "endsAt" + "marginMinutes" * interval '1 minute'
     AND "amountMinor" >= 0 AND "currency" ~ '^[A-Z]{3}$'
     AND ("status" <> 'HELD' OR "holdExpiresAt" IS NOT NULL)
     AND ("status" = 'CANCELLED') = ("cancellationParty" IS NOT NULL)
     AND ("status" = 'CONFIRMED' OR "attendance" = 'UNRECORDED')
     AND ("previousId" IS NULL OR "previousId" <> "id")
     AND "version" >= 1);

ALTER TABLE "Appointment" ADD CONSTRAINT "appointment_professional_occupied"
  EXCLUDE USING gist ("professionalId" WITH =, tstzrange("startsAt", "occupiedUntil", '[)') WITH &&)
  WHERE ("status" IN ('HELD', 'CONFIRMED'));

INSERT INTO "Capability" ("code", "description") VALUES
  ('person:manage', 'Registro y búsqueda administrativa de personas'),
  ('case:manage', 'Apertura y asignación administrativa de casos'),
  ('patient:invite', 'Invitar a una persona registrada con el rol paciente'),
  ('agenda:manage', 'Reservas y modificaciones administrativas de agenda'),
  ('agenda:configure', 'Configuración de servicios y disponibilidad sintética')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RoleCapability" ("roleId", "capabilityId")
SELECT r."id", c."id" FROM "Role" r CROSS JOIN "Capability" c
WHERE r."code" IN ('OPERATIONS_ADMIN', 'RECEPTION')
  AND c."code" IN ('person:manage', 'case:manage', 'patient:invite', 'agenda:manage', 'agenda:configure')
ON CONFLICT DO NOTHING;

-- The staging runtime is explicitly separate from the owner who runs migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fbe_runtime') THEN
    REVOKE ALL ON "ServiceDefinition", "ServiceProfessional", "ProfessionalHours",
      "ProfessionalAbsence", "ServiceTariff", "Appointment", "AgendaRequest" FROM fbe_runtime;
    GRANT SELECT, INSERT, UPDATE ON "ServiceDefinition", "ServiceProfessional",
      "ProfessionalHours", "Appointment" TO fbe_runtime;
    GRANT SELECT, INSERT ON "ProfessionalAbsence", "ServiceTariff", "AgendaRequest" TO fbe_runtime;
    GRANT DELETE ON "ProfessionalHours", "ProfessionalAbsence" TO fbe_runtime;
  END IF;
END $$;

COMMIT;
