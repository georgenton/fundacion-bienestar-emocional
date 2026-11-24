CREATE TABLE "AccountInvitation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tokenDigest" TEXT NOT NULL UNIQUE,
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "roleId" UUID NOT NULL REFERENCES "Role"("id") ON DELETE RESTRICT,
  "invitedByAccountId" UUID NOT NULL REFERENCES "UserAccount"("id") ON DELETE RESTRICT,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountInvitation_expiry_check" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "AccountInvitation_use_check" CHECK ("usedAt" IS NULL OR "usedAt" >= "createdAt")
);

CREATE INDEX "AccountInvitation_email_idx" ON "AccountInvitation"("email");
CREATE INDEX "AccountInvitation_expiresAt_usedAt_idx" ON "AccountInvitation"("expiresAt", "usedAt");

INSERT INTO "Capability" ("id", "code", "description")
VALUES (gen_random_uuid(), 'account:invite', 'Invitar y activar cuentas con rol explícito');

INSERT INTO "RoleCapability" ("roleId", "capabilityId")
SELECT r."id", c."id"
FROM "Role" r
JOIN "Capability" c ON c."code" = 'account:invite'
WHERE r."code" = 'OPERATIONS_ADMIN';
