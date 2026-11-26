#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

db=${1:?}
api=${2-}
scratch=${3:?}
[[ "$db" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]
[[ -d "$scratch" && -O "$scratch" && ! -L "$scratch" ]]

# Export one PostgreSQL snapshot for both the dump and its file references.
# Attachment bytes are immutable and published before the SQL commit.
docker exec -i "$db" sh -ceu '
  test "$POSTGRES_DB" = fbe_staging
  umask 077
  work=$(mktemp -d /dev/shm/fbe-snapshot.XXXXXXXX)
  trap "rm -r -- \"$work\"" EXIT
  export PGPASSWORD="$POSTGRES_PASSWORD" FBE_DUMP="$work/database.dump" FBE_CAPTURE_OK="$work/dump.ok"
  psql -XAtq -v ON_ERROR_STOP=1 -v manifest="$work/attachments.json" -U "$POSTGRES_USER" -d fbe_staging >/dev/null
  test -s "$FBE_DUMP" && test -f "$FBE_CAPTURE_OK" && test -s "$work/attachments.json"
  tar -C "$work" -cf - database.dump attachments.json
' 2>/dev/null <<'SQL' | tar -C "$scratch" -xf - database.dump attachments.json
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT NOT EXISTS (SELECT FROM public."Person" WHERE synthetic IS DISTINCT FROM true)
   AND NOT EXISTS (SELECT FROM public."CareCase" WHERE synthetic IS DISTINCT FROM true) AS approved,
  to_regclass('public."PrivateAttachment"') IS NOT NULL AS file_schema,
  pg_export_snapshot() AS snapshot
\gset
\if :approved
  \setenv FBE_SNAPSHOT :snapshot
  \! pg_dump --format=custom --no-password --snapshot="$FBE_SNAPSHOT" -U "$POSTGRES_USER" -d fbe_staging -f "$FBE_DUMP" && touch "$FBE_CAPTURE_OK"
  \o :manifest
  \if :file_schema
    SELECT coalesce(json_agg(json_build_object('key',"storageKey",'sha256',sha256,'bytes',bytes)
                   ORDER BY "storageKey"), '[]') FROM public."PrivateAttachment";
  \else
    SELECT 'null'::json;
  \endif
  \o
\endif
COMMIT;
SQL

if jq -e 'type == "null"' "$scratch/attachments.json" >/dev/null; then
  unlink "$scratch/attachments.json"
  exit 0
fi
[[ "$api" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]
# Validate the expected path and volume without reading any container environment.
path=/workspace/.local/private-attachments
docker inspect --format '{{json .Mounts}}' "$api" 2>/dev/null |
  jq -e --arg path "$path" 'any(.[]; .Destination == $path and .Type == "volume" and .RW)' >/dev/null
jq -e '
  type == "array" and length <= 98304 and
  (map(.key)|unique|length) == length and
  (map(.bytes)|add // 0) <= 98304 and
  all(.[]; (.key | test("^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$"))
    and (.sha256 | test("^[0-9a-f]{64}$")) and (.bytes | type == "number" and . >= 1 and . <= 16384 and . == floor))
' "$scratch/attachments.json" >/dev/null
mkdir "$scratch/attachments"
while IFS=$'\t' read -r key sha bytes; do
  file="$scratch/attachments/$key"
  docker exec "$api" sh -ceu 'test -f "$1" && test ! -L "$1" && test "$(wc -c <"$1")" -eq "$2"; cat -- "$1"' \
    fbe-file "$path/$key" "$bytes" >"$file" 2>/dev/null
  [[ "$(wc -c <"$file")" -eq "$bytes" && "$(openssl dgst -sha256 -r "$file" | cut -d ' ' -f1)" = "$sha" ]]
done < <(jq -r '.[] | [.key,.sha256,.bytes] | @tsv' "$scratch/attachments.json")
