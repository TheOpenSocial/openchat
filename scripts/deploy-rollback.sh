#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${SSH_KEY_PATH:?SSH_KEY_PATH is required}"

# Backward-compatible inputs:
# - ROLLBACK_REF: explicit git ref (commit/tag/branch)
# - ROLLBACK_IMAGE_TAG: legacy workflow input, treated as git ref
ROLLBACK_REF="${ROLLBACK_REF:-${ROLLBACK_IMAGE_TAG:-}}"
DEPLOY_MODE="${DEPLOY_MODE:-build}"
API_IMAGE="${API_IMAGE:-}"
ADMIN_IMAGE="${ADMIN_IMAGE:-}"
WEB_IMAGE="${WEB_IMAGE:-}"
REGISTRY_HOST="${REGISTRY_HOST:-ghcr.io}"
REGISTRY_USERNAME="${REGISTRY_USERNAME:-}"
REGISTRY_PASSWORD="${REGISTRY_PASSWORD:-}"

if [[ "$DEPLOY_MODE" != "images" ]]; then
  : "${ROLLBACK_REF:?ROLLBACK_REF (or ROLLBACK_IMAGE_TAG) is required}"
fi

DEPLOY_PATH="${DEPLOY_PATH:-/opt/opensocial}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-.env.production}"
REMOTE_TARGET="$DEPLOY_USER@$DEPLOY_HOST"

ssh_opts=(
  -i "$SSH_KEY_PATH"
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
)

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
    else \
      git fetch --all --tags; \
      git checkout '$ROLLBACK_REF'; \
      docker compose -f docker-compose.prod.yml --env-file '$REMOTE_ENV_FILE' build api admin web; \
    fi; \
    docker compose -f docker-compose.prod.yml --env-file '$REMOTE_ENV_FILE' run --rm api pnpm --filter @opensocial/api prisma:migrate:deploy; \
    docker compose -f docker-compose.prod.yml --env-file '$REMOTE_ENV_FILE' up -d nginx api admin web valkey; \
    docker compose -f docker-compose.prod.yml --env-file '$REMOTE_ENV_FILE' ps"
