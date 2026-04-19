#!/usr/bin/env bash
set -euo pipefail

LOCAL_DEPLOY="${LOCAL_DEPLOY:-0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DEPLOY_PATH="${DEPLOY_PATH:-/opt/opensocial}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-.env.production}"
DEPLOY_MODE="${DEPLOY_MODE:-build}"
DEPLOY_PHASE="${DEPLOY_PHASE:-all}"
DEPLOY_SERVICES="${DEPLOY_SERVICES:-api admin web docs}"
API_IMAGE="${API_IMAGE:-}"
ADMIN_IMAGE="${ADMIN_IMAGE:-}"
WEB_IMAGE="${WEB_IMAGE:-}"
DOCS_IMAGE="${DOCS_IMAGE:-}"
REGISTRY_HOST="${REGISTRY_HOST:-ghcr.io}"
REGISTRY_USERNAME="${REGISTRY_USERNAME:-}"
REGISTRY_PASSWORD="${REGISTRY_PASSWORD:-}"

sync_remote_env_var() {
  local key="$1"
  local value="${2-}"
  if [[ -z "$value" ]]; then
    return 0
  fi

  local value_b64
  value_b64="$(printf "%s" "$value" | base64 | tr -d "\n")"

  ssh "${ssh_opts[@]}" "$REMOTE_TARGET" \
    "DEPLOY_PATH='$DEPLOY_PATH' REMOTE_ENV_FILE='$REMOTE_ENV_FILE' ENV_KEY='$key' ENV_VALUE_B64='$value_b64' bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail
cd "$DEPLOY_PATH"
python3 - <<'PY'
import base64
import os
from pathlib import Path

env_file = Path(os.environ["REMOTE_ENV_FILE"])
key = os.environ["ENV_KEY"]
value = base64.b64decode(os.environ["ENV_VALUE_B64"]).decode("utf-8")

lines = env_file.read_text().splitlines() if env_file.exists() else []
prefix = f"{key}="
updated = False
for index, line in enumerate(lines):
    if line.startswith(prefix):
        lines[index] = f"{key}={value}"
        updated = True
        break

if not updated:
    lines.append(f"{key}={value}")

env_file.write_text("\n".join(lines) + "\n")
PY
REMOTE_SCRIPT
}

sync_local_env_var() {
  local key="$1"
  local value="${2-}"
  if [[ -z "$value" ]]; then
    return 0
  fi

  DEPLOY_PATH="$DEPLOY_PATH" REMOTE_ENV_FILE="$REMOTE_ENV_FILE" ENV_KEY="$key" ENV_VALUE="$value" python3 - <<'PY'
import os
from pathlib import Path

deploy_path = Path(os.environ["DEPLOY_PATH"])
env_file = deploy_path / os.environ["REMOTE_ENV_FILE"]
key = os.environ["ENV_KEY"]
value = os.environ["ENV_VALUE"]

lines = env_file.read_text().splitlines() if env_file.exists() else []
prefix = f"{key}="
updated = False
for index, line in enumerate(lines):
    if line.startswith(prefix):
        lines[index] = f"{key}={value}"
        updated = True
        break

if not updated:
    lines.append(f"{key}={value}")

env_file.write_text("\n".join(lines) + "\n")
PY
}

compose_cmd() {
  docker compose -f "$DEPLOY_PATH"/docker-compose.prod.yml --env-file "$DEPLOY_PATH"/"$REMOTE_ENV_FILE" "$@"
}

sync_local_checkout() {
  mkdir -p "$DEPLOY_PATH"
  rsync -a --delete \
    --exclude ".git" \
    --exclude "node_modules" \
    --exclude ".env" \
    --exclude ".env.local" \
    --exclude ".env.production" \
    "$REPO_ROOT"/ "$DEPLOY_PATH"/
  local compose_target="$DEPLOY_PATH"/docker-compose.prod.yml
  local caddy_target="$DEPLOY_PATH"/deploy/caddy/Caddyfile
  local compose_source="$REPO_ROOT"/docker-compose.prod.yml
  local caddy_source="$REPO_ROOT"/deploy/caddy/Caddyfile
  mkdir -p "$DEPLOY_PATH"/deploy/caddy
  if [[ "$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$compose_source")" != "$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$compose_target")" ]]; then
    cp "$compose_source" "$compose_target"
  fi
  if [[ -e "$caddy_target" ]]; then
    if [[ "$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$caddy_source")" != "$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$caddy_target")" ]]; then
      cp "$caddy_source" "$caddy_target"
    fi
  else
    cp "$caddy_source" "$caddy_target"
  fi
  sync_local_env_var "OPENAI_API_KEY" "${OPENAI_API_KEY:-}"
  sync_local_env_var "ONBOARDING_LLM_MODEL" "${ONBOARDING_LLM_MODEL:-}"
  sync_local_env_var "ONBOARDING_LLM_FAST_MODEL" "${ONBOARDING_LLM_FAST_MODEL:-}"
  sync_local_env_var "ONBOARDING_LLM_RICH_MODEL" "${ONBOARDING_LLM_RICH_MODEL:-}"
  sync_local_env_var "ONBOARDING_LLM_FAST_MODEL_CANDIDATES" "${ONBOARDING_LLM_FAST_MODEL_CANDIDATES:-}"
  sync_local_env_var "ONBOARDING_LLM_RICH_MODEL_CANDIDATES" "${ONBOARDING_LLM_RICH_MODEL_CANDIDATES:-}"
  sync_local_env_var "ONBOARDING_LLM_TIMEOUT_MS" "${ONBOARDING_LLM_TIMEOUT_MS:-}"
  sync_local_env_var "ONBOARDING_LLM_RICH_TIMEOUT_MS" "${ONBOARDING_LLM_RICH_TIMEOUT_MS:-}"
  sync_local_env_var "ONBOARDING_PROBE_TOKEN" "${ONBOARDING_PROBE_TOKEN:-}"
  sync_local_env_var "DATABASE_URL" "${DATABASE_URL:-}"
  sync_local_env_var "GOOGLE_CLIENT_ID" "${GOOGLE_CLIENT_ID:-}"
  sync_local_env_var "GOOGLE_CLIENT_SECRET" "${GOOGLE_CLIENT_SECRET:-}"
  sync_local_env_var "GOOGLE_REDIRECT_URI" "${GOOGLE_REDIRECT_URI:-}"
  sync_local_env_var "AWS_REGION" "${AWS_REGION:-}"
  sync_local_env_var "S3_ENDPOINT" "${S3_ENDPOINT:-}"
  sync_local_env_var "S3_ACCESS_KEY" "${S3_ACCESS_KEY:-}"
  sync_local_env_var "S3_SECRET_KEY" "${S3_SECRET_KEY:-}"
  sync_local_env_var "S3_BUCKET" "${S3_BUCKET:-}"
  sync_local_env_var "MEDIA_CDN_BASE_URL" "${MEDIA_CDN_BASE_URL:-}"
  sync_local_env_var "S3_PRESIGNED_UPLOADS_ENABLED" "${S3_PRESIGNED_UPLOADS_ENABLED:-}"
  sync_local_env_var "MEDIA_SIGNING_SECRET" "${MEDIA_SIGNING_SECRET:-}"
  sync_local_env_var "MEDIA_UPLOAD_SIGNING_SECRET" "${MEDIA_UPLOAD_SIGNING_SECRET:-}"
  sync_local_env_var "VIDEO_TRANSCRIPTS_MAX_BYTES" "${VIDEO_TRANSCRIPTS_MAX_BYTES:-}"
  sync_local_env_var "ADMIN_API_KEY" "${ADMIN_API_KEY:-}"
  sync_local_env_var "PLAYGROUND_ENABLED" "${PLAYGROUND_ENABLED:-}"
  sync_local_env_var "PLAYGROUND_MUTATIONS_ENABLED" "${PLAYGROUND_MUTATIONS_ENABLED:-}"
  sync_local_env_var "PLAYGROUND_ALLOWED_ADMIN_USER_IDS" "${PLAYGROUND_ALLOWED_ADMIN_USER_IDS:-}"
  sync_local_env_var "SMOKE_SESSION_APPLICATION_ENABLED" "${SMOKE_SESSION_APPLICATION_ENABLED:-}"
  sync_local_env_var "SMOKE_SESSION_APPLICATION_KEY" "${SMOKE_SESSION_APPLICATION_KEY:-}"
  sync_local_env_var "SMOKE_SESSION_APPLICATION_TOKEN" "${SMOKE_SESSION_APPLICATION_TOKEN:-}"
  sync_local_env_var "REQUEST_SECURITY_VERIFICATION_BYPASS_ENABLED" "${REQUEST_SECURITY_VERIFICATION_BYPASS_ENABLED:-}"
  sync_local_env_var "AGENTIC_VERIFICATION_LANE_ID" "${AGENTIC_VERIFICATION_LANE_ID:-}"
  sync_local_env_var "MATCHING_MAX_PENDING_INBOUND_REQUESTS_PER_RECIPIENT" "${MATCHING_MAX_PENDING_INBOUND_REQUESTS_PER_RECIPIENT:-}"
  sync_local_env_var "MATCHING_MAX_DAILY_INBOUND_REQUESTS_PER_RECIPIENT" "${MATCHING_MAX_DAILY_INBOUND_REQUESTS_PER_RECIPIENT:-}"
  sync_local_env_var "ALERT_REQUEST_PRESSURE_TOP_RECIPIENT_SHARE_THRESHOLD" "${ALERT_REQUEST_PRESSURE_TOP_RECIPIENT_SHARE_THRESHOLD:-}"
  sync_local_env_var "ALERT_REQUEST_PRESSURE_MIN_WINDOW_VOLUME_THRESHOLD" "${ALERT_REQUEST_PRESSURE_MIN_WINDOW_VOLUME_THRESHOLD:-}"
  sync_local_env_var "API_IMAGE" "${API_IMAGE:-}"
  sync_local_env_var "ADMIN_IMAGE" "${ADMIN_IMAGE:-}"
  sync_local_env_var "WEB_IMAGE" "${WEB_IMAGE:-}"
  sync_local_env_var "DOCS_IMAGE" "${DOCS_IMAGE:-}"
}

run_pull_or_build() {
  # shellcheck disable=SC2206
  local services=( $DEPLOY_SERVICES )
  if [[ ${#services[@]} -eq 0 ]]; then
    services=(api admin web docs)
  fi

  if [[ "$DEPLOY_MODE" == "images" ]]; then
    run_registry_login
    for service in "${services[@]}"; do
      run_pull_service "$service"
    done
  else
    COMPOSE_BAKE=true compose_cmd build "${services[@]}"
  fi
}

run_registry_login() {
  if [[ -n "$REGISTRY_USERNAME" && -n "$REGISTRY_PASSWORD" ]]; then
    printf "%s" "$REGISTRY_PASSWORD" | docker login "$REGISTRY_HOST" --username "$REGISTRY_USERNAME" --password-stdin
  else
    echo "Registry credentials not provided; skipping docker login."
  fi
}

run_pull_service() {
  local service="$1"
  compose_cmd pull "$service"
}

run_migrate() {
  compose_cmd run --rm --entrypoint sh api -lc "corepack enable && pnpm --filter @opensocial/api prisma:migrate:deploy"
}

run_up() {
  compose_cmd up -d nginx api admin web docs valkey
}

run_ps() {
  compose_cmd ps
}

curl_local_https() {
  local host="$1"
  local path="$2"
  shift 2

  curl \
    --silent \
    --show-error \
    --fail \
    --insecure \
    --retry 12 \
    --retry-delay 5 \
    --retry-all-errors \
    --connect-timeout 5 \
    --max-time 15 \
    --resolve "$host:443:127.0.0.1" \
    "$@" \
    "https://$host$path"
}

run_health() {
  local api_response=""
  api_response="$(curl_local_https "api.opensocial.so" "/health")"

  echo "$api_response"

  local video_page_status
  video_page_status="$(
    curl \
      --silent \
      --show-error \
      --output /tmp/opensocial-video-page.html \
      --write-out "%{http_code}" \
      --insecure \
      --retry 12 \
      --retry-delay 5 \
      --retry-all-errors \
      --connect-timeout 5 \
      --max-time 15 \
      --resolve "app.opensocial.so:443:127.0.0.1" \
      "https://app.opensocial.so/video"
  )"
  echo "video_page_http=${video_page_status}"
  if [[ "$video_page_status" != "200" ]]; then
    echo "Video page is not healthy." >&2
    head -c 200 /tmp/opensocial-video-page.html || true
    return 1
  fi

  local transcript_probe_status
  transcript_probe_status="$(
    curl \
      --silent \
      --show-error \
      --output /tmp/opensocial-video-api.json \
      --write-out "%{http_code}" \
      --insecure \
      --retry 12 \
      --retry-delay 5 \
      --retry-all-errors \
      --connect-timeout 5 \
      --max-time 15 \
      --resolve "api.opensocial.so:443:127.0.0.1" \
      --header "content-type: application/json" \
      --data '{}' \
      "https://api.opensocial.so/public/video-transcripts/upload-intent"
  )"
  echo "video_transcript_probe_http=${transcript_probe_status}"
  if [[ "$transcript_probe_status" != "400" ]]; then
    echo "Public video transcript endpoint did not respond as expected." >&2
    head -c 300 /tmp/opensocial-video-api.json || true
    return 1
  fi

  local docs_headers
  docs_headers="$(curl_local_https "docs.opensocial.so" "/docs" --head)"
  echo "$docs_headers"

  if grep -Eiq '^location: https?://[^[:space:]]+:3003/' <<<"$docs_headers"; then
    echo "Docs redirect leaked internal port 3003." >&2
    return 1
  fi

  if grep -Eiq '^location: http://' <<<"$docs_headers"; then
    echo "Docs redirect downgraded to http." >&2
    return 1
  fi

  curl_local_https "docs.opensocial.so" "/docs/" >/dev/null
}

run_logs() {
  compose_cmd ps --all || true
  docker inspect opensocial-api-1 --format '{{json .State}}' || true
  docker logs --tail 200 opensocial-api-1 || true
  compose_cmd logs --tail 200 api docs nginx
}

run_phase() {
  case "$DEPLOY_PHASE" in
    sync)
      sync_local_checkout
      ;;
    pull-or-build)
      run_pull_or_build
      ;;
    registry-login)
      run_registry_login
      ;;
    pull-api)
      run_pull_service api
      ;;
    pull-admin)
      run_pull_service admin
      ;;
    pull-web)
      run_pull_service web
      ;;
    pull-docs)
      run_pull_service docs
      ;;
    migrate)
      run_migrate
      ;;
    up)
      run_up
      ;;
    ps)
      run_ps
      ;;
    health)
      run_health
      ;;
    logs)
      run_logs
      ;;
    all)
      sync_local_checkout
      run_pull_or_build
      run_migrate
      run_up
      run_health
      run_ps
      ;;
    *)
      echo "Unknown DEPLOY_PHASE: $DEPLOY_PHASE" >&2
      exit 1
      ;;
  esac
}

if [[ "$LOCAL_DEPLOY" == "1" ]]; then
  run_phase
  exit 0
fi

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${SSH_KEY_PATH:?SSH_KEY_PATH is required}"
REMOTE_TARGET="$DEPLOY_USER@$DEPLOY_HOST"

ssh_opts=(
  -i "$SSH_KEY_PATH"
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
)

sync_remote_env_var "OPENAI_API_KEY" "${OPENAI_API_KEY:-}"
sync_remote_env_var "ONBOARDING_LLM_MODEL" "${ONBOARDING_LLM_MODEL:-}"
sync_remote_env_var "ONBOARDING_LLM_FAST_MODEL" "${ONBOARDING_LLM_FAST_MODEL:-}"
sync_remote_env_var "ONBOARDING_LLM_RICH_MODEL" "${ONBOARDING_LLM_RICH_MODEL:-}"
sync_remote_env_var "ONBOARDING_LLM_FAST_MODEL_CANDIDATES" "${ONBOARDING_LLM_FAST_MODEL_CANDIDATES:-}"
sync_remote_env_var "ONBOARDING_LLM_RICH_MODEL_CANDIDATES" "${ONBOARDING_LLM_RICH_MODEL_CANDIDATES:-}"
sync_remote_env_var "ONBOARDING_LLM_TIMEOUT_MS" "${ONBOARDING_LLM_TIMEOUT_MS:-}"
sync_remote_env_var "ONBOARDING_LLM_RICH_TIMEOUT_MS" "${ONBOARDING_LLM_RICH_TIMEOUT_MS:-}"
sync_remote_env_var "ONBOARDING_PROBE_TOKEN" "${ONBOARDING_PROBE_TOKEN:-}"
sync_remote_env_var "DATABASE_URL" "${DATABASE_URL:-}"
sync_remote_env_var "GOOGLE_CLIENT_ID" "${GOOGLE_CLIENT_ID:-}"
sync_remote_env_var "GOOGLE_CLIENT_SECRET" "${GOOGLE_CLIENT_SECRET:-}"
sync_remote_env_var "GOOGLE_REDIRECT_URI" "${GOOGLE_REDIRECT_URI:-}"
sync_remote_env_var "AWS_REGION" "${AWS_REGION:-}"
sync_remote_env_var "S3_ENDPOINT" "${S3_ENDPOINT:-}"
sync_remote_env_var "S3_ACCESS_KEY" "${S3_ACCESS_KEY:-}"
sync_remote_env_var "S3_SECRET_KEY" "${S3_SECRET_KEY:-}"
sync_remote_env_var "S3_BUCKET" "${S3_BUCKET:-}"
sync_remote_env_var "MEDIA_CDN_BASE_URL" "${MEDIA_CDN_BASE_URL:-}"
sync_remote_env_var "S3_PRESIGNED_UPLOADS_ENABLED" "${S3_PRESIGNED_UPLOADS_ENABLED:-}"
sync_remote_env_var "MEDIA_SIGNING_SECRET" "${MEDIA_SIGNING_SECRET:-}"
sync_remote_env_var "MEDIA_UPLOAD_SIGNING_SECRET" "${MEDIA_UPLOAD_SIGNING_SECRET:-}"
sync_remote_env_var "VIDEO_TRANSCRIPTS_MAX_BYTES" "${VIDEO_TRANSCRIPTS_MAX_BYTES:-}"
sync_remote_env_var "ADMIN_API_KEY" "${ADMIN_API_KEY:-}"
sync_remote_env_var "PLAYGROUND_ENABLED" "${PLAYGROUND_ENABLED:-}"
sync_remote_env_var "PLAYGROUND_MUTATIONS_ENABLED" "${PLAYGROUND_MUTATIONS_ENABLED:-}"
sync_remote_env_var "PLAYGROUND_ALLOWED_ADMIN_USER_IDS" "${PLAYGROUND_ALLOWED_ADMIN_USER_IDS:-}"
sync_remote_env_var "SOCIAL_SIM_ENABLED" "${SOCIAL_SIM_ENABLED:-}"
sync_remote_env_var "SOCIAL_SIM_MUTATIONS_ENABLED" "${SOCIAL_SIM_MUTATIONS_ENABLED:-}"
sync_remote_env_var "SOCIAL_SIM_ALLOWED_ADMIN_USER_IDS" "${SOCIAL_SIM_ALLOWED_ADMIN_USER_IDS:-}"
sync_remote_env_var "SMOKE_SESSION_APPLICATION_ENABLED" "${SMOKE_SESSION_APPLICATION_ENABLED:-}"
sync_remote_env_var "SMOKE_SESSION_APPLICATION_KEY" "${SMOKE_SESSION_APPLICATION_KEY:-}"
sync_remote_env_var "SMOKE_SESSION_APPLICATION_TOKEN" "${SMOKE_SESSION_APPLICATION_TOKEN:-}"
sync_remote_env_var "REQUEST_SECURITY_VERIFICATION_BYPASS_ENABLED" "${REQUEST_SECURITY_VERIFICATION_BYPASS_ENABLED:-}"
sync_remote_env_var "AGENTIC_VERIFICATION_LANE_ID" "${AGENTIC_VERIFICATION_LANE_ID:-}"
sync_remote_env_var "MATCHING_MAX_PENDING_INBOUND_REQUESTS_PER_RECIPIENT" "${MATCHING_MAX_PENDING_INBOUND_REQUESTS_PER_RECIPIENT:-}"
sync_remote_env_var "MATCHING_MAX_DAILY_INBOUND_REQUESTS_PER_RECIPIENT" "${MATCHING_MAX_DAILY_INBOUND_REQUESTS_PER_RECIPIENT:-}"
sync_remote_env_var "ALERT_REQUEST_PRESSURE_TOP_RECIPIENT_SHARE_THRESHOLD" "${ALERT_REQUEST_PRESSURE_TOP_RECIPIENT_SHARE_THRESHOLD:-}"
sync_remote_env_var "ALERT_REQUEST_PRESSURE_MIN_WINDOW_VOLUME_THRESHOLD" "${ALERT_REQUEST_PRESSURE_MIN_WINDOW_VOLUME_THRESHOLD:-}"
sync_remote_env_var "API_IMAGE" "${API_IMAGE:-}"
sync_remote_env_var "ADMIN_IMAGE" "${ADMIN_IMAGE:-}"
sync_remote_env_var "WEB_IMAGE" "${WEB_IMAGE:-}"
sync_remote_env_var "DOCS_IMAGE" "${DOCS_IMAGE:-}"
if [[ "$DEPLOY_PHASE" == "sync" || "$DEPLOY_PHASE" == "all" ]]; then
  ssh "${ssh_opts[@]}" "$REMOTE_TARGET" "mkdir -p '$DEPLOY_PATH'"
  rsync -az --delete \
    -e "ssh ${ssh_opts[*]}" \
    --exclude ".git" \
    --exclude "node_modules" \
    --exclude ".env" \
    --exclude ".env.local" \
    --exclude ".env.production" \
    ./ "$REMOTE_TARGET:$DEPLOY_PATH/"
fi

ssh "${ssh_opts[@]}" "$REMOTE_TARGET" \
  "set -euo pipefail; \
   cd '$DEPLOY_PATH'; \
   chmod +x scripts/deploy-production.sh; \
   LOCAL_DEPLOY=1 \
   DEPLOY_PATH='$DEPLOY_PATH' \
   REMOTE_ENV_FILE='$REMOTE_ENV_FILE' \
   DEPLOY_MODE='$DEPLOY_MODE' \
   DEPLOY_SERVICES='$DEPLOY_SERVICES' \
   DEPLOY_PHASE='$DEPLOY_PHASE' \
   API_IMAGE='$API_IMAGE' \
   ADMIN_IMAGE='$ADMIN_IMAGE' \
   WEB_IMAGE='$WEB_IMAGE' \
   DOCS_IMAGE='$DOCS_IMAGE' \
   REGISTRY_HOST='$REGISTRY_HOST' \
   REGISTRY_USERNAME='$REGISTRY_USERNAME' \
   REGISTRY_PASSWORD='$REGISTRY_PASSWORD' \
   ./scripts/deploy-production.sh"
