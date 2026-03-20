#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${SSH_KEY_PATH:?SSH_KEY_PATH is required}"

# Backward-compatible inputs:
# - ROLLBACK_REF: explicit git ref (commit/tag/branch)
# - ROLLBACK_IMAGE_TAG: legacy workflow input, treated as git ref
ROLLBACK_REF="${ROLLBACK_REF:-${ROLLBACK_IMAGE_TAG:-}}"
: "${ROLLBACK_REF:?ROLLBACK_REF (or ROLLBACK_IMAGE_TAG) is required}"

DEPLOY_PATH="${DEPLOY_PATH:-/opt/opensocial}"

ssh -i "$SSH_KEY_PATH" \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  "$DEPLOY_USER@$DEPLOY_HOST" \
  "set -euo pipefail; \
    cd '$DEPLOY_PATH'; \
    git fetch --all --tags; \
    git checkout '$ROLLBACK_REF'; \
    docker compose -f docker-compose.prod.yml --env-file .env.production build api admin web; \
    docker compose -f docker-compose.prod.yml --env-file .env.production run --rm api pnpm --filter @opensocial/api prisma:migrate:deploy; \
    docker compose -f docker-compose.prod.yml --env-file .env.production up -d nginx api admin web valkey; \
    docker compose -f docker-compose.prod.yml --env-file .env.production ps"
