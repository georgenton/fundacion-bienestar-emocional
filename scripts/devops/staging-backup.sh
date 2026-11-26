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

material=(api.env migration.env roles.sql release.json)
if [[ -e "$recovery/recovery.txt" ]]; then material+=(recovery.txt); fi
for name in "${material[@]}"; do
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
trap 'if [[ -n "$cipher_tmp" ]]; then rm -f -- "$cipher_tmp"; fi; rm -r -- "$scratch"' EXIT
cipher_tmp=$(mktemp "${output%/*}/.fbe-cipher.XXXXXXXX")
date +%s >"$scratch/captured-at"

archive=(database.dump captured-at)
if ! bash "$(dirname "$0")/staging-attachment-snapshot.sh" "$source_container" "${FBE_BACKUP_API_CONTAINER:-}" "$scratch"; then
  echo 'FBE PostgreSQL or private attachment snapshot failed.' >&2
  exit 1
fi
if [[ -f "$scratch/attachments.json" ]]; then archive+=(attachments.json attachments); fi
if ! docker exec -i "$source_container" pg_restore --file=/dev/null <"$scratch/database.dump" 2>/dev/null; then
  echo 'PostgreSQL archive validation failed.' >&2
  exit 1
fi

# Only ciphertext reaches the output directory. The recovery private key stays off-host.
tar -C "$scratch" -cf - "${archive[@]}" \
  -C "$(cd "$recovery" && pwd -P)" "${material[@]}" |
  gpg --batch --yes --trust-model always --recipient "$recipient" \
    --output "$cipher_tmp" --encrypt
# A hard link installs the complete file atomically and refuses an existing name.
ln -- "$cipher_tmp" "$output"
