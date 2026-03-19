#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${SSH_KEY_PATH:?SSH_KEY_PATH is required}"

DEPLOY_PATH="${DEPLOY_PATH:-/opt/opensocial}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

ssh -i "$SSH_KEY_PATH" \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  "$DEPLOY_USER@$DEPLOY_HOST" \
  "set -euo pipefail; \
    cd '$DEPLOY_PATH'; \
    export IMAGE_TAG='$IMAGE_TAG'; \
    docker compose -f docker-compose.prod.yml pull api admin web; \
    docker compose -f docker-compose.prod.yml run --rm api pnpm db:migrate; \
    docker compose -f docker-compose.prod.yml up -d api admin web workers; \
    docker compose -f docker-compose.prod.yml ps"
