-- Existing sessions have no per-session MFA evidence. They must complete a
-- verifier again; the user's enrollment flag cannot retroactively grant it.
ALTER TABLE "session" ADD COLUMN "mfaVerified" BOOLEAN NOT NULL DEFAULT false;
