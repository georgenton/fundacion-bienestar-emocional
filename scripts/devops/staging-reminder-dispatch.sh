#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077
state=/var/lib/fbe-staging-backup
exec 9>"$state/reminder-release.lock"
flock -n 9 || { echo 'fbe_reminders=release_change'; exit 75; }
# The existing active-release configuration is root-only. No env values are emitted.
source /etc/fbe-staging-backup/backup.env
[[ "$FBE_API_CONTAINER" =~ ^api-[a-zA-Z0-9-]+$ ]]
expected=$(jq -er '.images.api' "$FBE_RELEASE_MANIFEST")
[[ "$expected" =~ ^ghcr\.io/georgenton/fundacion-bienestar-emocional-api@sha256:[a-f0-9]{64}$ ]]
[[ "$(docker inspect --format '{{.Config.Image}} {{.State.Health.Status}}' "$FBE_API_CONTAINER")" = "$expected healthy" ]]
docker exec "$FBE_API_CONTAINER" node apps/worker/dist/dispatch.js
