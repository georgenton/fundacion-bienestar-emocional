#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077
if [[ $# != 4 ]]; then
  echo 'Usage: bash staging-backup-job.sh POSTGRES_CONTAINER RECOVERY_DIR GPG_FINGERPRINT STATUS_PATH' >&2
  exit 2
fi

status=$4
[[ "$status" == /* && ! -L "$status" ]]
started=$(date +%s)
work=
status_tmp=
verified=false

write_status() {
  jq -n --arg status "$1" --argjson when "$started" '{status:$status, captured_at:$when}' >"$status_tmp" &&
    mv -f -- "$status_tmp" "$status"
}

finish() {
  rc=$?
  if [[ "$verified" != true && -n "$status_tmp" ]]; then write_status failed || true; fi
  if [[ -n "$status_tmp" ]]; then rm -f -- "$status_tmp"; fi
  if [[ -n "$work" ]]; then
    rm -f -- "$work/backup.gpg" "$work/readback.gpg"
    rmdir -- "$work"
  fi
  exit "$rc"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
status_tmp=$(mktemp "${status%/*}/.fbe-status.XXXXXXXX")
endpoint=${FBE_BACKUP_S3_ENDPOINT:-}
prefix=${FBE_BACKUP_S3_PREFIX:-}
if [[ ! "$endpoint" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ||
      ! "$prefix" =~ ^s3://[a-z0-9][a-z0-9.-]+/fbe/staging/?$ ]]; then
  echo 'Set the authorized HTTPS storage endpoint and dedicated FBE prefix.' >&2
  exit 2
fi
work=$(mktemp -d "${TMPDIR:-/tmp}/fbe-upload.XXXXXXXX")
id="fbe-staging-$(date -u +%Y%m%dT%H%M%SZ)-${work##*.}"
object="${prefix%/}/$id.gpg"
backup="$work/backup.gpg"
readback="$work/readback.gpg"
bash "$(dirname "$0")/staging-backup.sh" "$1" "$2" "$3" "$backup"
size=$(wc -c <"$backup")
if (( size > 262144 )); then
  echo 'FBE ciphertext exceeds the 256 KiB staging budget. Review R2 headroom before retrying.' >&2
  exit 1
fi

if ! aws --endpoint-url "$endpoint" s3 cp "$backup" "$object" --storage-class STANDARD --only-show-errors >/dev/null 2>&1 ||
   ! aws --endpoint-url "$endpoint" s3 cp "$object" "$readback" --only-show-errors >/dev/null 2>&1 ||
   ! cmp -s "$backup" "$readback"; then
  echo 'FBE external backup failed upload or integrity verification.' >&2
  exit 1
fi
write_status verified
verified=true
printf 'backup_id=%s duration_seconds=%s ' "$id" "$(( $(date +%s) - started ))"
openssl dgst -sha256 "$backup" | awk '{ print "ciphertext_sha256=" $NF }'
