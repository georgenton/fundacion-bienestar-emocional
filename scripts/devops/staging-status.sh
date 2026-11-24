#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  public)
    # HTTPS verification is on. Do not log response bodies or response headers.
    api=${FBE_CHECK_API:-https://fbe-api-staging.syntavera.dev}
    web=${FBE_CHECK_WEB:-https://fbe-staging.syntavera.dev}
    if curl -fsS --proto '=https' --max-time 10 "$api/health" 2>/dev/null |
      jq -e '.status == "ok" and .database == "reachable" and .syntheticDataOnly == true' >/dev/null 2>&1 &&
      curl -fsS --proto '=https' --max-time 10 "$web/" 2>/dev/null |
        awk '/NO APTO PARA PACIENTES/ { found=1 } END { exit !found }'; then
      echo 'fbe_staging_public=ok'
    else
      echo 'fbe_staging_public=failed'
      exit 1
    fi
    ;;
  host)
    [[ $# == 5 ]] || { echo 'Usage: bash staging-status.sh host DOCKER_PATH MIN_FREE_KIB MIN_FREE_INODES BACKUP_STATUS' >&2; exit 2; }
    [[ "$3" =~ ^[0-9]{1,12}$ && "$4" =~ ^[0-9]{1,12}$ ]] || exit 2
    free_kib=$(df -Pk "$2" 2>/dev/null | awk 'NR==2 { print $4 }') || free_kib=
    inode_column=7
    if [[ "$(uname -s)" == Linux ]]; then
      inode_column=4
    fi
    free_inodes=$(df -Pi "$2" 2>/dev/null | awk -v col="$inode_column" 'NR==2 { print $col }') || free_inodes=
    if [[ "$free_kib" =~ ^[0-9]+$ && "$free_inodes" =~ ^[0-9]+$ ]] &&
      (( free_kib >= 10#$3 && free_inodes >= 10#$4 )); then
      echo 'fbe_staging_capacity=ok'
      failed=0
    else
      echo 'fbe_staging_capacity=failed'
      failed=1
    fi
    age=$(jq -er --argjson now "$(date +%s)" '
      select(.status == "verified" and (.captured_at | type == "number")) |
      $now - .captured_at | select(. >= 0 and . < 86400)
    ' "$5" 2>/dev/null) || age=
    if [[ "$age" =~ ^[0-9]+$ ]]; then
      echo 'fbe_staging_backup=ok'
    else
      echo 'fbe_staging_backup=failed_or_stale'
      failed=1
    fi
    exit "$failed"
    ;;
  *)
    echo 'Usage: bash staging-status.sh public | host DOCKER_PATH MIN_FREE_KIB MIN_FREE_INODES BACKUP_STATUS' >&2
    exit 2
    ;;
esac
