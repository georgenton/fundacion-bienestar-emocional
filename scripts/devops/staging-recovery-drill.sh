#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."

# Local-only rehearsal. Never use an existing database, network or volume.
[[ "$(docker context show)" == desktop-linux && -z "${DOCKER_HOST:-}" && -z "${DOCKER_CONTEXT:-}" ]] ||
  { echo 'Use the local desktop-linux Docker context for this rehearsal.' >&2; exit 2; }
endpoint=$(docker context inspect desktop-linux --format '{{.Endpoints.docker.Host}}') ||
  { echo 'Cannot inspect the local Docker context.' >&2; exit 2; }
[[ "$endpoint" == unix:///* ]] ||
  { echo 'The rehearsal requires a local Unix socket, not a remote Docker endpoint.' >&2; exit 2; }
# Pin every invocation, including the backup subprocess and cleanup, to this context.
# A concurrent `docker context use` must not redirect the rehearsal to another daemon.
export DOCKER_CONTEXT=desktop-linux
before=docs/releases/0438bf99615d2ccc74e6c97034dafdf4ebea3760.json
after=docs/releases/0de373ac92b8facf611fd8ce03fe7daae03db649.json
work=$(mktemp -d "${TMPDIR:-/tmp}/fbe-drill.XXXXXXXX")
prefix="fbe-drill-${work##*.}"
source_net="$prefix-source"
restore_net="$prefix-restore"
src="$prefix-src"
dst="$prefix-dst"
api="$prefix-api"
web="$prefix-web"
cleanup() {
  docker rm -f "$api" "$web" "$src" "$dst" >/dev/null 2>&1 || true
  docker network rm "$restore_net" "$source_net" >/dev/null 2>&1 || true
  gpgconf --homedir "$work/custodian" --kill gpg-agent >/dev/null 2>&1 || true
  gpgconf --homedir "$work/producer" --kill gpg-agent >/dev/null 2>&1 || true
  rm -rf -- "$work"
}
trap cleanup EXIT
mkdir "$work"/{custodian,producer,private,restore,transfer,fixtures}
for net in "$source_net" "$restore_net"; do
  docker network create --internal "$net" >/dev/null
done

export POSTGRES_PASSWORD
POSTGRES_PASSWORD=$(openssl rand -hex 24)
owner_password=$(openssl rand -hex 24)
runtime_password=$(openssl rand -hex 24)
auth_secret=$(openssl rand -hex 48)

db() {
  docker exec -i "$1" psql -XqAt -v ON_ERROR_STOP=1 -U fbe_drill_admin -d fbe_staging
}

start_db() {
  docker run -d --name "$1" --network "$2" --network-alias postgres \
    --tmpfs /var/lib/postgresql:rw,nosuid,size=512m \
    -e POSTGRES_USER=fbe_drill_admin -e POSTGRES_DB=fbe_staging -e POSTGRES_PASSWORD \
    postgres:18.7-bookworm >/dev/null
  for ((attempt=0; attempt<60; attempt++)); do
    if docker exec "$1" pg_isready -q -h 127.0.0.1 -U fbe_drill_admin -d fbe_staging; then return; fi
    sleep 1
  done
  return 1
}

cat >"$work/private/roles.sql" <<SQL
CREATE ROLE fbe_migrate LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '$owner_password';
CREATE ROLE fbe_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '$runtime_password';
ALTER DATABASE fbe_staging OWNER TO fbe_migrate;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO fbe_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE fbe_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fbe_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE fbe_migrate IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fbe_runtime;
SQL
cat >"$work/private/api.env" <<ENV
APP_ENV=production
APP_NAME=FBE-Recovery-Drill
API_PORT=3001
WEB_ORIGIN=http://web:3000
BETTER_AUTH_URL=http://api:3001
BETTER_AUTH_SECRET=$auth_secret
SYNTHETIC_DATA_ONLY=true
ALLOW_SYNTHETIC_SEED=false
DATABASE_URL=postgresql://fbe_runtime:$runtime_password@postgres:5432/fbe_staging?schema=public
ENV
printf 'DATABASE_URL=postgresql://fbe_migrate:%s@postgres:5432/fbe_staging?schema=public\n' \
  "$owner_password" >"$work/private/migration.env"
cp "$before" "$work/private/release.json"

function image() { jq -er --arg component "$2" '.images[$component]' "$1"; }
start_db "$src" "$source_net"
db "$src" <"$work/private/roles.sql"
docker run --rm --platform linux/amd64 --network "$source_net" \
  --env-file "$work/private/migration.env" "$(image "$before" migrate)"
docker run --rm --platform linux/amd64 --network "$source_net" \
  --env-file "$work/private/api.env" --env-file "$work/private/migration.env" \
  -e APP_ENV=test -e ALLOW_SYNTHETIC_SEED=true --user 0 \
  -v "$work/fixtures:/workspace/.local" "$(image "$before" migrate)" \
  ./node_modules/.bin/tsx database/seed.ts
db "$src" <<'SQL'
INSERT INTO public."AuditEvent" (action, "resourceType", decision, "reasonCode")
VALUES ('recovery-drill', 'synthetic', 'ALLOWED', 'DRILL');
SQL

gpg --homedir "$work/custodian" --batch --pinentry-mode loopback --passphrase '' \
  --quick-generate-key 'FBE disposable recovery drill' default default 1d 2>/dev/null
fingerprint=$(gpg --homedir "$work/custodian" --with-colons --list-keys 2>/dev/null |
  awk -F: '$1 == "fpr" && !seen++ { print $10 }')
gpg --homedir "$work/custodian" --batch --export "$fingerprint" |
  gpg --homedir "$work/producer" --batch --import 2>/dev/null

started=$(date +%s)
backup="$work/fbe-drill.gpg"
GNUPGHOME="$work/producer" bash scripts/devops/staging-backup.sh \
  "$src" "$work/private" "$fingerprint" "$backup"
cp "$backup" "$work/transfer/recovered.gpg"
cmp -s "$backup" "$work/transfer/recovered.gpg"
printf 'capture_and_transfer_seconds=%s ciphertext_bytes=%s\n' \
  "$(( $(date +%s) - started ))" "$(wc -c <"$backup" | tr -d ' ')"
shasum -a 256 "$backup" | awk '{ print "ciphertext_sha256=" $1 }'

started=$(date +%s)
gpg --homedir "$work/custodian" --batch --decrypt "$work/transfer/recovered.gpg" 2>/dev/null |
  tar -xf - -C "$work/restore"
cmp -s "$before" "$work/restore/release.json"
start_db "$dst" "$restore_net"
db "$dst" <"$work/restore/roles.sql"
docker exec -i "$dst" pg_restore --exit-on-error --single-transaction \
  --role=fbe_migrate -U fbe_drill_admin -d fbe_staging <"$work/restore/database.dump"
restore_date=$(date +%s)

snapshot() {
  db "$1" <<'SQL'
SELECT concat_ws('|',
  (SELECT count(*) FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name <> '202611240002_recovery_drill'),
  (SELECT count(*) FROM public."Person" WHERE synthetic),
  (SELECT count(*) FROM public."CareCase" WHERE synthetic),
  (SELECT count(*) FROM public."CaseParticipant"),
  (SELECT count(*) FROM public."CaseAssignment"),
  (SELECT count(*) FROM public."AuditEvent" WHERE action='recovery-drill'),
  (SELECT count(*) FROM pg_constraint WHERE contype='f' AND convalidated),
  (SELECT md5(string_agg(id::text, ',' ORDER BY id)) FROM public."CareCase"));
SQL
}
baseline=$(snapshot "$src")
[[ "$baseline" = 3\|8\|2\|2\|3\|1\|* && "$baseline" = "$(snapshot "$dst")" ]]
printf 'restore_sql_seconds=%s copy_age_at_restore_seconds=%s\n' \
  "$(( restore_date - started ))" "$(( restore_date - $(<"$work/restore/captured-at") ))"

check_images() {
  local manifest=$1
  local label='ENTORNO LOCAL'
  if [[ "$manifest" = "$after" ]]; then label='ENTORNO DE PRUEBAS'; fi
  docker run --rm --platform linux/amd64 --network "$restore_net" \
    --env-file "$work/restore/migration.env" "$(image "$manifest" migrate)"
  docker run -d --name "$api" --network "$restore_net" --network-alias api --platform linux/amd64 \
    --env-file "$work/restore/api.env" "$(image "$manifest" api)" >/dev/null
  docker run -d --name "$web" --network "$restore_net" --network-alias web --platform linux/amd64 \
    -e HOSTNAME=0.0.0.0 -e PORT=3000 "$(image "$manifest" web)" >/dev/null
  docker cp "$work/fixtures/demo-credentials.json" "$api:/workspace/.local/drill-credentials.json"
  docker exec --user 0 "$api" chown node:node /workspace/.local/drill-credentials.json
  docker exec -i "$api" node --input-type=module - "$label" <<'JS'
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
async function ready(url) {
  for (let i = 0; i < 45; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return res;
    } catch {}
    await setTimeout(1000);
  }
  throw new Error('Drill endpoint failed readiness');
}
function requireCheck(condition, check) {
  if (!condition) throw new Error(check);
}
const base = 'http://api:3001';
const origin = 'http://web:3000';
const health = await (await ready(base + '/health')).json();
requireCheck(health.status === 'ok' && health.database === 'reachable' && health.syntheticDataOnly === true, 'Health');
const html = await (await ready(origin)).text();
requireCheck(html.includes('NO APTO PARA PACIENTES') && html.includes(process.argv[2]), 'Web safety banner');
const fixtures = JSON.parse(readFileSync('/workspace/.local/drill-credentials.json', 'utf8'));
const anon = await fetch(base + '/api/cases');
requireCheck(anon.status === 401, 'Anonymous denial');
const { email, password } = fixtures.actors.patient;
const login = await fetch(base + '/api/auth/sign-in/email', {
  method: 'POST', headers: { origin, 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, rememberMe: false }),
});
requireCheck(login.status === 200, 'Patient login');
const cookie = login.headers.getSetCookie().map((entry) => entry.split(';', 1)[0]).join('; ');
const allowed = await fetch(base + '/api/cases/' + fixtures.cases.caseA + '/overview', { headers: { cookie } });
const denied = await fetch(base + '/api/cases/' + fixtures.cases.caseB + '/overview', { headers: { cookie } });
requireCheck(allowed.status === 200 && denied.status === 404, 'Patient case separation');
console.log('health=200 web=200 anonymous=401 patient_login=200 own_case=200 other_case=404');
JS
  docker rm -f "$api" "$web" >/dev/null
}

check_images "$before"
printf 'recovery_to_functional_api_seconds=%s\n' "$(( $(date +%s) - started ))"

runtime_query() {
  PGPASSWORD="$runtime_password" docker exec -i -e PGPASSWORD "$dst" \
    psql -XqAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -U fbe_runtime -d fbe_staging
}

runtime_properties=$(runtime_query <<'SQL'
SELECT concat_ws('|',
  NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit),
  NOT EXISTS (SELECT FROM pg_auth_members WHERE member=pg_roles.oid),
  NOT pg_has_role(current_user, 'fbe_migrate','SET'),
  NOT EXISTS (SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=pg_roles.oid AND deptype='o'),
  NOT has_schema_privilege(current_user,'public','CREATE'))
FROM pg_roles WHERE rolname=current_user;
SQL
)
[[ "$runtime_properties" = 't|t|t|t|t' ]]
expect_denial() {
  local result
  if result=$(printf '%s\n' '\set VERBOSITY verbose' "$2" | runtime_query 2>&1) ||
     ! grep -q "ERROR:  $1:" <<<"$result"; then
    echo "Unexpected outcome of permission check: $3" >&2
    exit 1
  fi
  printf '%s=%s\n' "$3" "$1"
}
expect_denial 42501 'CREATE TABLE public.drill_should_not_exist (id int);' create_table_denied
expect_denial 42501 'ALTER TABLE public."CareCase" ADD COLUMN bad int;' alter_table_denied
expect_denial 42501 'SET ROLE fbe_migrate;' assume_migration_role_denied
expect_denial 42501 'TRUNCATE public."AuditEvent";' audit_truncate_denied
expect_denial P0001 'BEGIN; UPDATE public."AuditEvent" SET action=action; ROLLBACK;' audit_update_denied
expect_denial P0001 'BEGIN; DELETE FROM public."AuditEvent"; ROLLBACK;' audit_delete_denied

# The additive SQL exists only under the drill directory, mounted in its migrator.
mkdir "$work/migration"
printf '%s\n' 'BEGIN;' \
  'ALTER TABLE public."CareCase" ADD COLUMN "recoveryDrillMarker" text;' \
  'CREATE TABLE public."RecoveryDrillDefaultAcl" (id bigserial PRIMARY KEY, note text NOT NULL);' \
  'COMMIT;' >"$work/migration/migration.sql"
chmod 755 "$work/migration"
chmod 644 "$work/migration/migration.sql"
upgrade_started=$(date +%s)
for attempt in first repeat; do
  docker run --rm --platform linux/amd64 --network "$restore_net" \
    --env-file "$work/restore/migration.env" \
    --mount "type=bind,src=$work/migration,dst=/workspace/database/migrations/202611240002_recovery_drill,readonly" \
    "$(image "$after" migrate)"
done
[[ "$(db "$dst" <<'SQL'
SELECT count(*) FROM public."_prisma_migrations"
WHERE migration_name='202611240002_recovery_drill' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;
SQL
)" = 1 ]]
[[ "$baseline" = "$(snapshot "$dst")" ]]
[[ "$(runtime_query <<'SQL'
BEGIN;
INSERT INTO public."RecoveryDrillDefaultAcl" (note) VALUES ('fixture');
UPDATE public."RecoveryDrillDefaultAcl" SET note='updated';
SELECT count(*) FROM public."RecoveryDrillDefaultAcl" WHERE note='updated';
DELETE FROM public."RecoveryDrillDefaultAcl";
ROLLBACK;
SQL
)" = 1 ]]
expect_denial 42501 'DROP TABLE public."RecoveryDrillDefaultAcl";' new_table_drop_denied
check_images "$after"
printf 'upgrade_and_functional_check_seconds=%s\n' "$(( $(date +%s) - upgrade_started ))"
rollback_started=$(date +%s)
check_images "$before"
[[ "$baseline" = "$(snapshot "$dst")" ]]
[[ "$(db "$dst" <<'SQL'
SELECT count(*) FROM information_schema.columns
WHERE table_schema='public' AND table_name='CareCase' AND column_name='recoveryDrillMarker';
SQL
)" = 1 ]]
printf 'rollback_and_functional_check_seconds=%s\n' "$(( $(date +%s) - rollback_started ))"
