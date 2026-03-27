#!/usr/bin/env bash
set -euo pipefail

LOCAL_DEPLOY="${LOCAL_DEPLOY:-0}"

DEPLOY_PATH="${DEPLOY_PATH:-/opt/opensocial}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-.env.production}"
DEPLOY_MODE="${DEPLOY_MODE:-build}"
DEPLOY_PHASE="${DEPLOY_PHASE:-all}"
API_IMAGE="${API_IMAGE:-}"
ADMIN_IMAGE="${ADMIN_IMAGE:-}"
WEB_IMAGE="${WEB_IMAGE:-}"
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
  docker compose -f docker-compose.prod.yml --env-file "$REMOTE_ENV_FILE" "$@"
}

sync_local_checkout() {
  mkdir -p "$DEPLOY_PATH"
  rsync -a --delete \
    --exclude ".git" \
    --exclude "node_modules" \
    --exclude ".env" \
    --exclude ".env.local" \
    --exclude ".env.production" \
    ./ "$DEPLOY_PATH"/
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
  sync_local_env_var "ADMIN_API_KEY" "${ADMIN_API_KEY:-}"
  sync_local_env_var "PLAYGROUND_ENABLED" "${PLAYGROUND_ENABLED:-}"
  sync_local_env_var "PLAYGROUND_MUTATIONS_ENABLED" "${PLAYGROUND_MUTATIONS_ENABLED:-}"
  sync_local_env_var "PLAYGROUND_ALLOWED_ADMIN_USER_IDS" "${PLAYGROUND_ALLOWED_ADMIN_USER_IDS:-}"
  sync_local_env_var "SMOKE_SESSION_APPLICATION_ENABLED" "${SMOKE_SESSION_APPLICATION_ENABLED:-}"
  sync_local_env_var "SMOKE_SESSION_APPLICATION_KEY" "${SMOKE_SESSION_APPLICATION_KEY:-}"
  sync_local_env_var "SMOKE_SESSION_APPLICATION_TOKEN" "${SMOKE_SESSION_APPLICATION_TOKEN:-}"
  sync_local_env_var "API_IMAGE" "${API_IMAGE:-}"
  sync_local_env_var "ADMIN_IMAGE" "${ADMIN_IMAGE:-}"
  sync_local_env_var "WEB_IMAGE" "${WEB_IMAGE:-}"
}

run_pull_or_build() {
  if [[ "$DEPLOY_MODE" == "images" ]]; then
    run_registry_login
    run_pull_service api
    run_pull_service admin
    run_pull_service web
  else
    COMPOSE_BAKE=true compose_cmd build api admin web
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
  compose_cmd up -d nginx api admin web valkey
}

run_ps() {
  compose_cmd ps
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
    migrate)
      run_migrate
      ;;
    up)
      run_up
      ;;
    ps)
      run_ps
      ;;
    all)
      sync_local_checkout
      run_pull_or_build
      run_migrate
      run_up
      run_ps
      ;;
    *)
      echo "Unknown DEPLOY_PHASE: $DEPLOY_PHASE" >&2
      exit 1
      ;;
  esac
}

if [[ "$LOCAL_DEPLOY" == "1" ]]; then
  cd "$DEPLOY_PATH"
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
sync_remote_env_var "ADMIN_API_KEY" "${ADMIN_API_KEY:-}"
sync_remote_env_var "PLAYGROUND_ENABLED" "${PLAYGROUND_ENABLED:-}"
sync_remote_env_var "PLAYGROUND_MUTATIONS_ENABLED" "${PLAYGROUND_MUTATIONS_ENABLED:-}"
sync_remote_env_var "PLAYGROUND_ALLOWED_ADMIN_USER_IDS" "${PLAYGROUND_ALLOWED_ADMIN_USER_IDS:-}"
sync_remote_env_var "SMOKE_SESSION_APPLICATION_ENABLED" "${SMOKE_SESSION_APPLICATION_ENABLED:-}"
sync_remote_env_var "SMOKE_SESSION_APPLICATION_KEY" "${SMOKE_SESSION_APPLICATION_KEY:-}"
sync_remote_env_var "SMOKE_SESSION_APPLICATION_TOKEN" "${SMOKE_SESSION_APPLICATION_TOKEN:-}"
sync_remote_env_var "API_IMAGE" "${API_IMAGE:-}"
sync_remote_env_var "ADMIN_IMAGE" "${ADMIN_IMAGE:-}"
sync_remote_env_var "WEB_IMAGE" "${WEB_IMAGE:-}"

ssh "${ssh_opts[@]}" \
  "$REMOTE_TARGET" \
  "set -euo pipefail; \
    cd '$DEPLOY_PATH'; \
    if [[ '$DEPLOY_MODE' == 'images' ]]; then \
      if [[ -n '$REGISTRY_USERNAME' && -n '$REGISTRY_PASSWORD' ]]; then printf '%s' '$REGISTRY_PASSWORD' | docker login '$REGISTRY_HOST' --username '$REGISTRY_USERNAME' --password-stdin; fi; \
      docker compose -f docker-compose.prod.yml --env-file '$REMOTE_ENV_FILE' pull api admin web; \
    else COMPOSE_BAKE=true docker compose -f docker-compose.prod.yml --env-file '$REMOTE_ENV_FILE' build api admin web; fi; \
    docker compose -f docker-compose.prod.yml --env-file '$REMOTE_ENV_FILE' run --rm --entrypoint sh api -lc 'corepack enable && pnpm --filter @opensocial/api prisma:migrate:deploy'; \
    docker compose -f docker-compose.prod.yml --env-file '$REMOTE_ENV_FILE' up -d nginx api admin web valkey; \
    docker compose -f docker-compose.prod.yml --env-file '$REMOTE_ENV_FILE' ps"
