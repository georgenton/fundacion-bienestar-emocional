#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

if [[ $# != 5 ]]; then
  echo 'Usage: bash staging-recovery-material.sh POSTGRES API MIGRATOR RELEASE_JSON EMPTY_TMPFS_DIR' >&2
  exit 2
fi

db=$1
api=$2
migrator=$3
manifest=$4
private=$5
for container in "$db" "$api" "$migrator"; do
  [[ "$container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || exit 2
done
[[ "$private" == /* && -d "$private" && ! -L "$private" && -O "$private" ]]
[[ "$(stat -c %a "$private")" = 700 && "$(stat -f -c %T "$private")" = tmpfs ]]
[[ -z "$(find "$private" -mindepth 1 -maxdepth 1 -print -quit)" ]]
[[ "$(docker inspect --format '{{.Config.Image}}' "$api")" = "$(jq -er '.images.api' "$manifest")" ]]
[[ "$(docker inspect --format '{{.Config.Image}}' "$migrator")" = "$(jq -er '.images.migrate' "$manifest")" ]]

# Extract only application settings named here, directly to the protected tmpfs.
docker inspect "$api" | jq -er '
  .[0].Config.Env | map(capture("^(?<key>[^=]+)=(?<value>.*)$")) | from_entries |
  if .APP_ENV != "production" or .SYNTHETIC_DATA_ONLY != "true" or .ALLOW_SYNTHETIC_SEED != "false" then
    error("Unexpected FBE safety configuration")
  else . end |
  . as $env |
  (["APP_ENV","APP_NAME","API_PORT","WEB_ORIGIN","BETTER_AUTH_URL","BETTER_AUTH_SECRET",
   "AUTH_RESET_TOKEN_TTL_SECONDS","DATABASE_URL","ALLOW_SYNTHETIC_SEED","SYNTHETIC_DATA_ONLY","LOG_LEVEL"] +
    (["ALLOW_SYNTHETIC_INVITATIONS","FBE_PRIVATE_ATTACHMENTS_DIR"] | map(select($env[.] != null))))[] as $key |
  if ($env[$key] | type) == "string" and ($env[$key] | length) > 0 and
     ($env[$key] | test("[\r\n]") | not) then "\($key)=\($env[$key])"
  else error("Required FBE setting is missing") end
' >"$private/api.env" 2>/dev/null
docker inspect "$migrator" | jq -er '
  .[0].Config.Env | map(select(startswith("DATABASE_URL=postgresql://"))) |
  if length == 1 and (.[0] | test("[\r\n]") | not) then .[0] else error("Unexpected migration setting") end
' >"$private/migration.env" 2>/dev/null

# pg_dump carries object ACLs and default privileges, but not login roles or
# database ACLs when restoring into an existing empty database.
if ! docker exec -i "$db" sh -ceu '
  test "$POSTGRES_DB" = fbe_staging && test "$POSTGRES_USER" = fbe_migrate
  exec psql -XAtq -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
' >"$private/roles.sql" 2>/dev/null <<'SQL'
BEGIN READ ONLY;
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_authid WHERE rolname IN ('fbe_migrate','fbe_runtime') AND rolcanlogin
      AND rolpassword LIKE 'SCRAM-SHA-256$%') <> 2
     OR EXISTS (SELECT FROM pg_auth_members WHERE member IN ('fbe_migrate'::regrole,'fbe_runtime'::regrole))
     OR EXISTS (SELECT FROM pg_db_role_setting WHERE setrole IN ('fbe_migrate'::regrole,'fbe_runtime'::regrole)
          OR setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database()))
     OR EXISTS (SELECT FROM pg_database, LATERAL aclexplode(datacl) a WHERE datname=current_database()
          AND (a.grantor <> datdba OR a.grantee NOT IN (0,'fbe_migrate'::regrole,'fbe_runtime'::regrole)))
  THEN RAISE EXCEPTION 'FBE role topology changed'; END IF;
END
$check$;
SELECT format('CREATE ROLE %I LOGIN %s %s %s %s %s %s CONNECTION LIMIT %s VALID UNTIL %L PASSWORD %L;',
  rolname, CASE WHEN rolsuper THEN 'SUPERUSER' ELSE 'NOSUPERUSER' END,
  CASE WHEN rolinherit THEN 'INHERIT' ELSE 'NOINHERIT' END,
  CASE WHEN rolcreaterole THEN 'CREATEROLE' ELSE 'NOCREATEROLE' END,
  CASE WHEN rolcreatedb THEN 'CREATEDB' ELSE 'NOCREATEDB' END,
  CASE WHEN rolreplication THEN 'REPLICATION' ELSE 'NOREPLICATION' END,
  CASE WHEN rolbypassrls THEN 'BYPASSRLS' ELSE 'NOBYPASSRLS' END,
  rolconnlimit, coalesce(rolvaliduntil::text,'infinity'), rolpassword)
FROM pg_authid WHERE rolname IN ('fbe_migrate','fbe_runtime') ORDER BY rolname;
SELECT format('ALTER DATABASE %I OWNER TO %I;', datname, pg_get_userbyid(datdba))
FROM pg_database WHERE datname=current_database();
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC;', current_database());
SELECT format('GRANT %s ON DATABASE %I TO %s%s;', privilege_type, datname,
  CASE WHEN grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(grantee)) END,
  CASE WHEN is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
FROM pg_database, LATERAL aclexplode(coalesce(datacl,acldefault('d',datdba)))
WHERE datname=current_database() ORDER BY grantee, privilege_type;
COMMIT;
SQL
then
  echo 'Cannot capture the expected FBE-only roles and database ACL.' >&2
  exit 1
fi

cp "$manifest" "$private/release.json"
printf '%s\n' \
  'Restore into a separate PostgreSQL 18 database fbe_staging initialized by a separate bootstrap administrator.' \
  'Restore attachments from the same snapshot in a private volume and verify their hashes against PostgreSQL.' \
  'Apply roles.sql before pg_restore. Preserve owner, object ACLs and default privileges from the dump.' \
  'Connect the API and migrator to private PostgreSQL on port 5432. Use separate runtime and migration URLs.' \
  'For a drill, rebind database hosts and API/web origins to the internal Docker network.' \
  'For staging, use TLS at the Coolify proxy, WEB_ORIGIN and BETTER_AUTH_URL from api.env, and keep seeding disabled.' \
  >"$private/recovery.txt"
