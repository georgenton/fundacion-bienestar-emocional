#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

state=${STATE_DIRECTORY:?}
status="$state/status.json"
exec 9>"$state/cycle.lock"
if ! flock --nonblock 9; then
  echo 'Another FBE backup or configuration change holds the lock.' >&2
  exit 1
fi

# Fail closed if setup or the cycle fails. Only the cycle can publish verified.
status_tmp=$(mktemp "$state/.service-status.XXXXXXXX")
work=
finish() {
  rc=$?
  if [[ -n "$work" ]]; then rm -rf -- "$work" || rc=1; fi
  if (( rc != 0 )); then
    jq -n --argjson at "$(date +%s)" '{status:"failed",captured_at:$at}' >"$status_tmp" &&
      mv -f -- "$status_tmp" "$status" || echo 'Cannot persist FBE backup failure.' >&2
  fi
  rm -f -- "$status_tmp"
  exit "$rc"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
runtime=${RUNTIME_DIRECTORY:?}
[[ "$(stat -f -c %T "$runtime")" == tmpfs ]]
work=$(mktemp -d "$runtime/fbe-service.XXXXXXXX")
path="$state/bin:/usr/bin:/bin"
# Renew once before capture. Both S3 calls share this session for the bounded run.
env -i HOME="$work" PATH="$path" \
  FBE_R2_ISSUER_URL="${FBE_R2_ISSUER_URL:?}" FBE_R2_ISSUER_HEADER="${CREDENTIALS_DIRECTORY:?}/issuer-header" \
  /bin/bash "$script_dir/staging-r2-credentials.sh" >"$work/session.json"
printf '[profile fbe-staging]\nregion = auto\ncredential_process = /bin/cat %s/session.json\n' "$work" >"$work/aws-config"

# Isolate AWS sources from operator profiles, environment, container metadata and IMDS.
env -i HOME="$work" PATH="$path" TMPDIR="$work" GNUPGHOME="$state/gnupg" \
  AWS_PROFILE=fbe-staging AWS_CONFIG_FILE="$work/aws-config" AWS_SHARED_CREDENTIALS_FILE=/dev/null \
  AWS_EC2_METADATA_DISABLED=true AWS_MAX_ATTEMPTS=1 AWS_CLI_AUTO_PROMPT=off \
  FBE_BACKUP_S3_ENDPOINT="${FBE_BACKUP_S3_ENDPOINT:?}" FBE_BACKUP_S3_PREFIX="${FBE_BACKUP_S3_PREFIX:?}" \
  /bin/bash "$script_dir/staging-backup-cycle.sh" \
    "$FBE_PG_CONTAINER" "$FBE_API_CONTAINER" "$FBE_MIGRATE_CONTAINER" "$FBE_WEB_CONTAINER" \
    "$FBE_RELEASE_MANIFEST" "$FBE_GPG_FINGERPRINT" "$status"
