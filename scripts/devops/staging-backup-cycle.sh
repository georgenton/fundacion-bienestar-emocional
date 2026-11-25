#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

if [[ $# != 7 ]]; then
  echo 'Usage: bash staging-backup-cycle.sh POSTGRES API MIGRATOR WEB RELEASE_JSON GPG_FINGERPRINT STATUS_PATH' >&2
  exit 2
fi

db=$1
containers=("$2" "$3" "$4")
components=(api migrate web)
manifest=$5
recipient=$6
status=$7
# Configure STATUS_PATH on persistent storage, outside the per-run tmpfs directory.
[[ "$status" == /* && ! -L "$status" && ! -d "$status" ]] || exit 2
status_dir=$(dirname -- "$status")
[[ -d "$status_dir" ]] || exit 2
started=$(date +%s)
work=
status_tmp=

finish() {
  rc=$?
  if [[ -n "$work" ]]; then rm -rf -- "$work" || rc=1; fi
  if (( rc != 0 )) && [[ -n "$status_tmp" ]]; then
    if ! jq -n --argjson when "$started" '{status:"failed",captured_at:$when}' >"$status_tmp" ||
       ! mv -f -- "$status_tmp" "$status"; then
      echo 'Cannot persist the FBE backup failure status.' >&2
    fi
  fi
  if [[ -n "$status_tmp" ]]; then rm -f -- "$status_tmp"; fi
  exit "$rc"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
status_tmp=$(mktemp "$status_dir/.fbe-cycle-status.XXXXXXXX")

for container in "$db" "${containers[@]}"; do
  [[ "$container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || exit 2
done
[[ "$recipient" =~ ^([A-Fa-f0-9]{40}|[A-Fa-f0-9]{64})$ ]] || exit 2
if [[ -z "${TMPDIR:-}" || "$TMPDIR" != /* || ! -d "$TMPDIR" || -L "$TMPDIR" ]] ||
   [[ "$(stat -f -c %T "$TMPDIR")" != tmpfs ]]; then
  echo 'Set TMPDIR to an existing tmpfs directory for the FBE backup cycle.' >&2
  exit 2
fi
work=$(mktemp -d "${TMPDIR%/}/fbe-cycle.XXXXXXXX")
[[ -O "$work" && ! -L "$work" && "$(stat -c %a "$work")" = 700 ]]
export TMPDIR="$work"
mkdir "$work/recovery"
cp -- "$manifest" "$work/manifest.json"

# Freeze the manifest for this capture and compare every active component by digest.
for index in 0 1 2; do
  component=${components[$index]}
  expected=$(jq -er --arg component "$component" '.images[$component]' "$work/manifest.json")
  [[ "$expected" =~ ^ghcr[.]io/georgenton/fundacion-bienestar-emocional-${component}@sha256:[a-f0-9]{64}$ ]]
  if ! active=$(docker inspect --format '{{.Config.Image}}' "${containers[$index]}" 2>/dev/null) ||
     [[ "$active" != "$expected" ]]; then
    echo "The active FBE $component image does not match the release manifest." >&2
    exit 1
  fi
done

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
bash "$script_dir/staging-recovery-material.sh" \
  "$db" "${containers[0]}" "${containers[1]}" "$work/manifest.json" "$work/recovery"
# Only the existing job may publish a verified status after its encrypted S3 readback.
bash "$script_dir/staging-backup-job.sh" "$db" "$work/recovery" "$recipient" "$status"
