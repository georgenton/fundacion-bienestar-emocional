#!/usr/bin/env bash
set +x
set -euo pipefail

issuer=${FBE_R2_ISSUER_URL:-}
header=${FBE_R2_ISSUER_HEADER:-}
if [[ ! "$issuer" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?/[A-Za-z0-9/_-]+$ ||
      "$header" != /* || ! -f "$header" || ! -r "$header" ]]; then
  echo 'FBE R2 issuer configuration is unavailable.' >&2
  exit 1
fi

# Fetch a fresh session. The issuer fixes the bucket, prefix and allowed actions.
# stdout is reserved for the credential_process document. Keep responses and errors out of logs.
if ! credentials=$(curl -q -fsS --proto '=https' --connect-timeout 5 --max-time 12 --max-filesize 16384 \
  --request POST --header "@$header" "$issuer" 2>/dev/null |
  jq -esc --argjson now "$(date +%s)" '
    select(length == 1) | .[0] |
    select(.Version == 1 and
      ([.AccessKeyId, .SecretAccessKey, .SessionToken] | all(type == "string" and length > 0)) and
      (.Expiration | fromdateiso8601 | . >= $now + 360 and . <= $now + 3600)) |
    {Version, AccessKeyId, SecretAccessKey, SessionToken, Expiration}
  ' 2>/dev/null); then
  echo 'FBE R2 temporary credential could not be renewed.' >&2
  exit 1
fi
printf '%s\n' "$credentials"
