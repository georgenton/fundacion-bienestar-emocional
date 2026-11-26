-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('CARE', 'INTERN_PARTICIPATION');

-- CreateEnum
CREATE TYPE "ConsentMedium" AS ENUM ('PATIENT_PORTAL', 'STAFF_WITNESSED');

-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('OPEN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ClinicalNoteStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'RETURNED', 'VALIDATED');

-- CreateEnum
CREATE TYPE "PracticeState" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('TRAINING', 'SUPERVISION', 'PREPARATION');

-- CreateEnum
CREATE TYPE "ActivityState" AS ENUM ('PENDING', 'RETURNED', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AttachmentClass" AS ENUM ('CASE_DOCUMENT', 'CONSENT_EVIDENCE', 'PRACTICE_DOCUMENT');

-- CreateEnum
CREATE TYPE "AttachmentState" AS ENUM ('PRIVATE');

-- CreateEnum
CREATE TYPE "InformationState" AS ENUM ('REQUESTED', 'VERIFIED', 'REVIEWED', 'DELIVERED');

-- AlterTable
ALTER TABLE "CaseAssignment" ADD COLUMN     "practiceId" UUID;

-- CreateTable
CREATE TABLE "ConsentTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purpose" "ConsentPurpose" NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "recordedById" UUID NOT NULL,
    "medium" "ConsentMedium" NOT NULL,
    "scope" TEXT NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL,
    "withdrawnAt" TIMESTAMPTZ(3),
    "withdrawnById" UUID,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "status" "EncounterStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalNote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "encounterId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "practiceId" UUID,
    "authorId" UUID NOT NULL,
    "authorFunction" "AssignmentFunction" NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "narrative" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ClinicalNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "validatorId" UUID,
    "validatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ClinicalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteReview" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "noteId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "transition" "ClinicalNoteStatus" NOT NULL,
    "version" INTEGER NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalAddendum" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "noteId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalAddendum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Practice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "internId" UUID NOT NULL,
    "supervisorId" UUID NOT NULL,
    "institution" TEXT NOT NULL,
    "institutionalRef" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "state" "PracticeState" NOT NULL DEFAULT 'ACTIVE',
    "clinicalSimulation" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Practice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeChange" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "practiceId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "previousSupervisorId" UUID NOT NULL,
    "supervisorId" UUID NOT NULL,
    "state" "PracticeState" NOT NULL,
    "clinicalSimulation" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeActivity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "practiceId" UUID NOT NULL,
    "previousId" UUID,
    "reviewerId" UUID,
    "kind" "ActivityKind" NOT NULL,
    "day" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "status" "ActivityState" NOT NULL DEFAULT 'PENDING',
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateAttachment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseId" UUID,
    "practiceId" UUID,
    "consentId" UUID,
    "createdById" UUID NOT NULL,
    "previousId" UUID,
    "kind" "AttachmentClass" NOT NULL,
    "state" "AttachmentState" NOT NULL DEFAULT 'PRIVATE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "storageKey" UUID NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivateAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttachmentShare" (
    "personId" UUID NOT NULL,
    "attachmentId" UUID NOT NULL,
    "sharedById" UUID NOT NULL,
    "sharedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttachmentShare_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateTable
CREATE TABLE "InformationRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "handlerId" UUID,
    "attachmentId" UUID,
    "scope" TEXT NOT NULL,
    "status" "InformationState" NOT NULL DEFAULT 'REQUESTED',
    "initiatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMPTZ(3),
    "reviewedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "thirdPartyReviewed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "InformationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsentTemplate_purpose_version_key" ON "ConsentTemplate"("purpose", "version");

-- CreateIndex
CREATE INDEX "ConsentRecord_caseId_personId_acceptedAt_idx" ON "ConsentRecord"("caseId", "personId", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_appointmentId_key" ON "Encounter"("appointmentId");

-- CreateIndex
CREATE INDEX "Encounter_caseId_openedAt_idx" ON "Encounter"("caseId", "openedAt");

-- CreateIndex
CREATE INDEX "ClinicalNote_encounterId_recordedAt_idx" ON "ClinicalNote"("encounterId", "recordedAt");

-- CreateIndex
CREATE INDEX "ClinicalNote_practiceId_status_idx" ON "ClinicalNote"("practiceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NoteReview_noteId_version_key" ON "NoteReview"("noteId", "version");

-- CreateIndex
CREATE INDEX "ClinicalAddendum_noteId_createdAt_idx" ON "ClinicalAddendum"("noteId", "createdAt");

-- CreateIndex
CREATE INDEX "Practice_internId_startsAt_idx" ON "Practice"("internId", "startsAt");

-- CreateIndex
CREATE INDEX "Practice_supervisorId_startsAt_idx" ON "Practice"("supervisorId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeChange_practiceId_version_key" ON "PracticeChange"("practiceId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeActivity_previousId_key" ON "PracticeActivity"("previousId");

-- CreateIndex
CREATE INDEX "PracticeActivity_practiceId_status_day_idx" ON "PracticeActivity"("practiceId", "status", "day");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateAttachment_previousId_key" ON "PrivateAttachment"("previousId");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateAttachment_storageKey_key" ON "PrivateAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "PrivateAttachment_caseId_kind_idx" ON "PrivateAttachment"("caseId", "kind");

-- CreateIndex
CREATE INDEX "PrivateAttachment_practiceId_idx" ON "PrivateAttachment"("practiceId");

-- CreateIndex
CREATE INDEX "InformationRequest_caseId_initiatedAt_idx" ON "InformationRequest"("caseId", "initiatedAt");

-- AddForeignKey
ALTER TABLE "CaseAssignment" ADD CONSTRAINT "CaseAssignment_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CareCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ConsentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CareCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "CaseAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_validatorId_fkey" FOREIGN KEY ("validatorId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteReview" ADD CONSTRAINT "NoteReview_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "ClinicalNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteReview" ADD CONSTRAINT "NoteReview_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAddendum" ADD CONSTRAINT "ClinicalAddendum_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "ClinicalNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAddendum" ADD CONSTRAINT "ClinicalAddendum_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Practice" ADD CONSTRAINT "Practice_internId_fkey" FOREIGN KEY ("internId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Practice" ADD CONSTRAINT "Practice_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeChange" ADD CONSTRAINT "PracticeChange_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeChange" ADD CONSTRAINT "PracticeChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeActivity" ADD CONSTRAINT "PracticeActivity_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeActivity" ADD CONSTRAINT "PracticeActivity_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeActivity" ADD CONSTRAINT "PracticeActivity_previousId_fkey" FOREIGN KEY ("previousId") REFERENCES "PracticeActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateAttachment" ADD CONSTRAINT "PrivateAttachment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CareCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateAttachment" ADD CONSTRAINT "PrivateAttachment_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateAttachment" ADD CONSTRAINT "PrivateAttachment_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "ConsentRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateAttachment" ADD CONSTRAINT "PrivateAttachment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateAttachment" ADD CONSTRAINT "PrivateAttachment_previousId_fkey" FOREIGN KEY ("previousId") REFERENCES "PrivateAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentShare" ADD CONSTRAINT "AttachmentShare_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "PrivateAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentShare" ADD CONSTRAINT "AttachmentShare_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformationRequest" ADD CONSTRAINT "InformationRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CareCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformationRequest" ADD CONSTRAINT "InformationRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformationRequest" ADD CONSTRAINT "InformationRequest_handlerId_fkey" FOREIGN KEY ("handlerId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformationRequest" ADD CONSTRAINT "InformationRequest_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "AttachmentShare"("attachmentId") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "AttachmentShare" ADD CONSTRAINT "AttachmentShare_personId_fkey" FOREIGN KEY ("personId")
  REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity constraints for private content and append-only workflow history.
ALTER TABLE "ConsentTemplate" ADD CHECK ("version" > 0);
ALTER TABLE "ConsentRecord" ADD CHECK (
  ("withdrawnAt" IS NULL AND "withdrawnById" IS NULL) OR
  ("withdrawnAt" IS NOT NULL AND "withdrawnAt" >= "acceptedAt" AND "withdrawnById" IS NOT NULL)
);
ALTER TABLE "Encounter" ADD CHECK (("completedAt" IS NOT NULL) = ("status" = 'COMPLETED'));
ALTER TABLE "Practice" ADD CHECK ("startsAt" < "endsAt" AND "internId" <> "supervisorId" AND "version" > 0);
ALTER TABLE "PracticeActivity" ADD CHECK ("minutes" BETWEEN 1 AND 480);
ALTER TABLE "CaseAssignment" ADD CHECK ("practiceId" IS NULL OR "function" = 'INTERN');
ALTER TABLE "ClinicalNote" ADD CHECK (("practiceId" IS NOT NULL) = ("authorFunction" = 'INTERN'));
ALTER TABLE "ClinicalNote" ADD CHECK (
  ("status" = 'VALIDATED' AND "validatorId" IS NOT NULL AND "validatedAt" IS NOT NULL) OR
  ("status" <> 'VALIDATED' AND "validatorId" IS NULL AND "validatedAt" IS NULL)
);
ALTER TABLE "PrivateAttachment" ADD CHECK ("bytes" BETWEEN 1 AND 16384 AND "version" > 0
  AND "sha256" ~ '^[a-f0-9]{64}$' AND "mediaType" = 'text/plain' AND (
  ("kind" = 'PRACTICE_DOCUMENT' AND "practiceId" IS NOT NULL AND "caseId" IS NULL AND "consentId" IS NULL) OR
  ("kind" = 'CASE_DOCUMENT' AND "practiceId" IS NULL AND "caseId" IS NOT NULL AND "consentId" IS NULL) OR
  ("kind" = 'CONSENT_EVIDENCE' AND "practiceId" IS NULL AND "caseId" IS NOT NULL AND "consentId" IS NOT NULL)
));

CREATE FUNCTION fbe_protect_clinical_note() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD."status" = 'VALIDATED') THEN
    RAISE EXCEPTION 'Clinical notes are retained and validated notes are immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' OR NEW."version" <> 1 OR NOT EXISTS (
      SELECT 1 FROM "CaseAssignment" a JOIN "Encounter" e ON e."caseId" = a."caseId"
      WHERE a."id" = NEW."assignmentId" AND e."id" = NEW."encounterId"
        AND a."accountId" = NEW."authorId" AND a."function" = NEW."authorFunction"
        AND a."practiceId" IS NOT DISTINCT FROM NEW."practiceId" AND e."occurredAt" = NEW."occurredAt"
    ) THEN RAISE EXCEPTION 'Clinical note provenance mismatch'; END IF;
  ELSE
    IF NEW."version" <> OLD."version" + 1 THEN RAISE EXCEPTION 'Invalid note version'; END IF;
    IF ROW(NEW."id",NEW."encounterId",NEW."assignmentId",NEW."authorId",NEW."authorFunction",NEW."practiceId",
        NEW."templateVersion",NEW."occurredAt",NEW."recordedAt") IS DISTINCT FROM
       ROW(OLD."id",OLD."encounterId",OLD."assignmentId",OLD."authorId",OLD."authorFunction",OLD."practiceId",
        OLD."templateVersion",OLD."occurredAt",OLD."recordedAt") THEN
      RAISE EXCEPTION 'Clinical note provenance cannot change';
    END IF;
    IF OLD."status" = 'IN_REVIEW' AND NEW."narrative" IS DISTINCT FROM OLD."narrative" THEN
      RAISE EXCEPTION 'Review cannot edit authored text';
    END IF;
    IF NEW."status" = 'VALIDATED' AND NEW."authorFunction" = 'INTERN' AND
      (OLD."status" <> 'IN_REVIEW' OR NEW."validatorId" = NEW."authorId" OR NOT EXISTS (
        SELECT 1 FROM "Practice" WHERE id = NEW."practiceId" AND "supervisorId" = NEW."validatorId"
      )) THEN RAISE EXCEPTION 'Intern validation requires the responsible supervisor'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER protect_clinical_note BEFORE INSERT OR UPDATE OR DELETE ON "ClinicalNote"
FOR EACH ROW EXECUTE FUNCTION fbe_protect_clinical_note();

CREATE FUNCTION fbe_retain_clinical_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Clinical history is append-only';
END $$;
CREATE TRIGGER retain_consent_template BEFORE UPDATE OR DELETE ON "ConsentTemplate"
FOR EACH ROW EXECUTE FUNCTION fbe_retain_clinical_history();
CREATE TRIGGER retain_clinical_addendum BEFORE UPDATE OR DELETE ON "ClinicalAddendum"
FOR EACH ROW EXECUTE FUNCTION fbe_retain_clinical_history();
CREATE TRIGGER retain_note_review BEFORE UPDATE OR DELETE ON "NoteReview"
FOR EACH ROW EXECUTE FUNCTION fbe_retain_clinical_history();
CREATE TRIGGER retain_attachment BEFORE UPDATE OR DELETE ON "PrivateAttachment"
FOR EACH ROW EXECUTE FUNCTION fbe_retain_clinical_history();

INSERT INTO "ConsentTemplate" ("purpose", "version", "body") VALUES
  ('CARE', 1, 'Texto ficticio de prueba. Finalidad: simular la atención individual del caso indicado. Pendiente de validación institucional.'),
  ('INTERN_PARTICIPATION', 1, 'Texto ficticio de prueba. Finalidad: simular el aporte supervisado de un pasante en el caso indicado. Pendiente de validación institucional.');
INSERT INTO "Role" ("code", "description", "isStaff", "isClinical")
  VALUES ('CLINICAL_COORDINATOR', 'Coordinación por caso sin lectura clínica implícita', true, true)
  ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Capability" ("code", "description") VALUES
  ('case:clinical:coordinate', 'Otorgar y revocar alcance clínico explícito por caso'),
  ('practice:coordinate', 'Coordinar fichas de prácticas sintéticas'),
  ('case:list:all', 'Lista operativa mínima de casos'),
  ('case:overview:read', 'Vista operativa sin contenido clínico')
  ON CONFLICT ("code") DO NOTHING;
INSERT INTO "RoleCapability" ("roleId", "capabilityId")
SELECT r.id, c.id FROM "Role" r CROSS JOIN "Capability" c
WHERE r.code = 'CLINICAL_COORDINATOR' AND c.code IN ('case:clinical:coordinate', 'practice:coordinate',
  'case:list:all', 'case:overview:read')
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'fbe_runtime') THEN
    REVOKE ALL ON "ConsentTemplate", "ConsentRecord", "Encounter", "ClinicalNote", "NoteReview", "ClinicalAddendum",
      "Practice", "PracticeChange", "PracticeActivity", "PrivateAttachment", "AttachmentShare", "InformationRequest" FROM fbe_runtime;
    GRANT SELECT, INSERT ON "ConsentTemplate", "ConsentRecord", "Encounter", "ClinicalNote", "NoteReview", "ClinicalAddendum",
      "Practice", "PracticeChange", "PracticeActivity", "PrivateAttachment", "AttachmentShare", "InformationRequest" TO fbe_runtime;
    GRANT UPDATE ("revokedAt") ON "CaseAssignment" TO fbe_runtime;
    GRANT UPDATE ("withdrawnAt", "withdrawnById") ON "ConsentRecord" TO fbe_runtime;
    GRANT UPDATE ("status", "completedAt") ON "Encounter" TO fbe_runtime;
    GRANT UPDATE ("narrative", "version", "status", "validatorId", "validatedAt") ON "ClinicalNote" TO fbe_runtime;
    GRANT UPDATE ("supervisorId", "state", "clinicalSimulation", "version") ON "Practice" TO fbe_runtime;
    GRANT UPDATE ("reviewerId", "status", "reviewReason", "reviewedAt") ON "PracticeActivity" TO fbe_runtime;
    GRANT UPDATE ("handlerId", "attachmentId", "status", "verifiedAt", "reviewedAt", "deliveredAt", "thirdPartyReviewed")
      ON "InformationRequest" TO fbe_runtime;
  END IF;
END $$;
