#!/usr/bin/env bash
set -euo pipefail

LOCAL_DEPLOY="${LOCAL_DEPLOY:-0}"

DEPLOY_PATH="${DEPLOY_PATH:-/opt/opensocial}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-.env.production}"

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

run_deploy_commands() {
  COMPOSE_BAKE=true docker compose -f docker-compose.prod.yml --env-file "$REMOTE_ENV_FILE" build api admin web
  docker compose -f docker-compose.prod.yml --env-file "$REMOTE_ENV_FILE" run --rm --entrypoint sh api -lc "corepack enable && pnpm --filter @opensocial/api prisma:migrate:deploy"
  docker compose -f docker-compose.prod.yml --env-file "$REMOTE_ENV_FILE" up -d nginx api admin web valkey
  docker compose -f docker-compose.prod.yml --env-file "$REMOTE_ENV_FILE" ps
}

if [[ "$LOCAL_DEPLOY" == "1" ]]; then
  mkdir -p "$DEPLOY_PATH"
  rsync -a --delete \
    --exclude ".git" \
    --exclude "node_modules" \
    --exclude ".env" \
    --exclude ".env.local" \
    --exclude ".env.production" \
    ./ "$DEPLOY_PATH"/
  sync_local_env_var "OPENAI_API_KEY" "${OPENAI_API_KEY:-}"
  cd "$DEPLOY_PATH"
  run_deploy_commands
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

ssh "${ssh_opts[@]}" \
  "$REMOTE_TARGET" \
  "set -euo pipefail; \
    cd '$DEPLOY_PATH'; \
    COMPOSE_BAKE=true docker compose -f docker-compose.prod.yml --env-file '$REMOTE_ENV_FILE' build api admin web; \
    docker compose -f docker-compose.prod.yml --env-file '$REMOTE_ENV_FILE' run --rm --entrypoint sh api -lc 'corepack enable && pnpm --filter @opensocial/api prisma:migrate:deploy'; \
    docker compose -f docker-compose.prod.yml --env-file '$REMOTE_ENV_FILE' up -d nginx api admin web valkey; \
    docker compose -f docker-compose.prod.yml --env-file '$REMOTE_ENV_FILE' ps"
