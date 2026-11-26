#!/usr/bin/env bash
set +x
set -euo pipefail
container=${1:?}
restore_dir=${2:?}
[[ "$container" =~ ^fbe-(drill|restore)-[A-Za-z0-9_.-]+$ ]]
[[ -f "$restore_dir/attachments.json" && ! -L "$restore_dir/attachments.json" ]]
expected=$(jq -ceS 'sort_by(.key)' "$restore_dir/attachments.json")
actual=$(
  docker exec -i "$container" sh -ceu '
    test "$POSTGRES_DB" = fbe_staging
    exec psql -XAtq -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
  ' <<'SQL' | jq -ceS 'sort_by(.key)'
SELECT coalesce(json_agg(json_build_object('key', "storageKey", 'sha256', sha256, 'bytes', bytes)), '[]')
FROM public."PrivateAttachment";
SQL
)
[[ "$actual" = "$expected" ]]
count=0
while IFS=$'\t' read -r key sha bytes; do
  [[ "$key" =~ ^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$ ]]
  file="$restore_dir/attachments/$key"
  [[ -f "$file" && ! -L "$file" && "$(wc -c <"$file")" -eq "$bytes" &&
    "$(openssl dgst -sha256 -r "$file" | cut -d ' ' -f1)" = "$sha" ]]
  count=$((count + 1))
done < <(jq -r '.[] | [.key,.sha256,.bytes] | @tsv' "$restore_dir/attachments.json")
printf 'restored_database_file_references=%s\n' "$count"
