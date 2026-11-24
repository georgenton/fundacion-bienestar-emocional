#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

if [[ $# != 4 ]]; then
  echo 'Usage: bash staging-backup.sh POSTGRES_CONTAINER RECOVERY_DIR GPG_FINGERPRINT OUTPUT.gpg' >&2
  exit 2
fi

source_container=$1
recovery=$2
recipient=$3
output=$4
[[ "$source_container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]
[[ "$recipient" =~ ^([A-Fa-f0-9]{40}|[A-Fa-f0-9]{64})$ ]]
[[ "$output" == /*.gpg && ! -e "$output" && ! -L "$output" ]]

for name in api.env migration.env roles.sql release.json; do
  [[ -s "$recovery/$name" && -f "$recovery/$name" && ! -L "$recovery/$name" ]]
done
jq -e '
  .source_repository == "georgenton/fundacion-bienestar-emocional" and
  .verification.image_smoke == "passed" and
  (.source_sha | test("^[a-f0-9]{40}$")) and
  (.images | keys == ["api", "migrate", "web"]) and
  (.images | to_entries | map(
    .key as $component |
    .value | test("^ghcr[.]io/georgenton/fundacion-bienestar-emocional-" + $component + "@sha256:[a-f0-9]{64}$")
  ) | all)
' "$recovery/release.json" >/dev/null

scratch=$(mktemp -d "${TMPDIR:-/tmp}/fbe-backup.XXXXXXXX")
cipher_tmp=
trap 'if [[ -n "$cipher_tmp" ]]; then rm -f -- "$cipher_tmp"; fi; rm -f -- "$scratch/database.dump" "$scratch/captured-at"; rmdir -- "$scratch"' EXIT
cipher_tmp=$(mktemp "${output%/*}/.fbe-cipher.XXXXXXXX")
date +%s >"$scratch/captured-at"

# The container uses its existing PostgreSQL client and credentials internally.
# Never accept another database name or print connection values.
if ! docker exec "$source_container" sh -ceu '
  test "$POSTGRES_DB" = fbe_staging
  export PGPASSWORD="$POSTGRES_PASSWORD"
  approved=$(psql -XAtq -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d fbe_staging -c '\''
    SELECT NOT EXISTS (SELECT FROM public."Person" WHERE synthetic IS DISTINCT FROM true)
       AND NOT EXISTS (SELECT FROM public."CareCase" WHERE synthetic IS DISTINCT FROM true)
  '\'')
  test "$approved" = t
  exec pg_dump --format=custom --no-password -U "$POSTGRES_USER" -d fbe_staging
' >"$scratch/database.dump" 2>/dev/null; then
  echo 'FBE synthetic source validation or PostgreSQL dump failed.' >&2
  exit 1
fi
if ! docker exec -i "$source_container" pg_restore --file=/dev/null <"$scratch/database.dump" 2>/dev/null; then
  echo 'PostgreSQL archive validation failed.' >&2
  exit 1
fi

# Only ciphertext reaches the output directory. The recovery private key stays off-host.
tar -C "$scratch" -cf - database.dump captured-at \
  -C "$(cd "$recovery" && pwd -P)" api.env migration.env roles.sql release.json |
  gpg --batch --yes --trust-model always --recipient "$recipient" \
    --output "$cipher_tmp" --encrypt
# A hard link installs the complete file atomically and refuses an existing name.
ln -- "$cipher_tmp" "$output"
