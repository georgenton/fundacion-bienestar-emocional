CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "AccountStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'PAUSED', 'CLOSED');
CREATE TYPE "ParticipantKind" AS ENUM ('PATIENT', 'OTHER_PARTICIPANT', 'REPRESENTATIVE');
CREATE TYPE "AssignmentFunction" AS ENUM ('TREATING_PROFESSIONAL', 'SUPERVISOR', 'INTERN');
CREATE TYPE "AuditDecision" AS ENUM ('ALLOWED', 'DENIED', 'ERROR');

CREATE TABLE "user" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  "image" TEXT,
  "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "session" (
  "id" TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX "session_userId_idx" ON "session"("userId");

CREATE TABLE "account" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_providerId_accountId_key" UNIQUE ("providerId", "accountId")
);
CREATE INDEX "account_userId_idx" ON "account"("userId");

CREATE TABLE "verification" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

CREATE TABLE "twoFactor" (
  "id" TEXT PRIMARY KEY,
  "secret" TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMPTZ,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX "twoFactor_userId_idx" ON "twoFactor"("userId");
CREATE INDEX "twoFactor_secret_idx" ON "twoFactor"("secret");

CREATE TABLE "Person" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "displayName" TEXT NOT NULL,
  "contactEmail" TEXT UNIQUE,
  "synthetic" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Person_synthetic_check" CHECK ("synthetic" = TRUE)
);

CREATE TABLE "UserAccount" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "authUserId" TEXT NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE RESTRICT,
  "personId" UUID NOT NULL UNIQUE REFERENCES "Person"("id") ON DELETE RESTRICT,
  "status" "AccountStatus" NOT NULL DEFAULT 'INVITED',
  "mfaRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  "disabledAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserAccount_disabled_consistency_check" CHECK (
    ("status" = 'DISABLED' AND "disabledAt" IS NOT NULL)
    OR ("status" <> 'DISABLED' AND "disabledAt" IS NULL)
  )
);
CREATE INDEX "UserAccount_status_idx" ON "UserAccount"("status");

CREATE TABLE "Role" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL UNIQUE,
  "description" TEXT NOT NULL,
  "isStaff" BOOLEAN NOT NULL DEFAULT FALSE,
  "isClinical" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE "Capability" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL UNIQUE,
  "description" TEXT NOT NULL
);

CREATE TABLE "RoleCapability" (
  "roleId" UUID NOT NULL REFERENCES "Role"("id") ON DELETE CASCADE,
  "capabilityId" UUID NOT NULL REFERENCES "Capability"("id") ON DELETE CASCADE,
  PRIMARY KEY ("roleId", "capabilityId")
);

CREATE TABLE "AccountRole" (
  "accountId" UUID NOT NULL REFERENCES "UserAccount"("id") ON DELETE CASCADE,
  "roleId" UUID NOT NULL REFERENCES "Role"("id") ON DELETE RESTRICT,
  "startsAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMPTZ,
  PRIMARY KEY ("accountId", "roleId", "startsAt"),
  CONSTRAINT "AccountRole_interval_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);
CREATE INDEX "AccountRole_accountId_startsAt_endsAt_idx" ON "AccountRole"("accountId", "startsAt", "endsAt");

CREATE TABLE "CareCase" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "referenceCode" TEXT NOT NULL UNIQUE,
  "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
  "synthetic" BOOLEAN NOT NULL DEFAULT TRUE,
  "openedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CareCase_synthetic_check" CHECK ("synthetic" = TRUE),
  CONSTRAINT "CareCase_closed_consistency_check" CHECK (
    ("status" = 'CLOSED' AND "closedAt" IS NOT NULL)
    OR ("status" <> 'CLOSED' AND "closedAt" IS NULL)
  )
);

CREATE TABLE "CaseParticipant" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "caseId" UUID NOT NULL REFERENCES "CareCase"("id") ON DELETE RESTRICT,
  "personId" UUID NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT,
  "kind" "ParticipantKind" NOT NULL,
  "portalAccess" BOOLEAN NOT NULL DEFAULT FALSE,
  "startsAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMPTZ,
  CONSTRAINT "CaseParticipant_caseId_personId_kind_key" UNIQUE ("caseId", "personId", "kind"),
  CONSTRAINT "CaseParticipant_interval_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);
CREATE INDEX "CaseParticipant_personId_startsAt_endsAt_idx" ON "CaseParticipant"("personId", "startsAt", "endsAt");

CREATE TABLE "CaseAssignment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "caseId" UUID NOT NULL REFERENCES "CareCase"("id") ON DELETE RESTRICT,
  "accountId" UUID NOT NULL REFERENCES "UserAccount"("id") ON DELETE RESTRICT,
  "function" "AssignmentFunction" NOT NULL,
  "allowedActions" TEXT[] NOT NULL,
  "startsAt" TIMESTAMPTZ NOT NULL,
  "endsAt" TIMESTAMPTZ,
  "revokedAt" TIMESTAMPTZ,
  CONSTRAINT "CaseAssignment_interval_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt"),
  CONSTRAINT "CaseAssignment_revocation_check" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "startsAt")
);
CREATE INDEX "CaseAssignment_caseId_accountId_startsAt_endsAt_revokedAt_idx"
  ON "CaseAssignment"("caseId", "accountId", "startsAt", "endsAt", "revokedAt");

CREATE TABLE "AuditEvent" (
  "id" BIGSERIAL PRIMARY KEY,
  "actorAccountId" UUID REFERENCES "UserAccount"("id") ON DELETE SET NULL,
  "action" TEXT NOT NULL,
  "capability" TEXT,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "decision" "AuditDecision" NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "context" JSONB,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditEvent_occurredAt_idx" ON "AuditEvent"("occurredAt");
CREATE INDEX "AuditEvent_actorAccountId_occurredAt_idx" ON "AuditEvent"("actorAccountId", "occurredAt");

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
