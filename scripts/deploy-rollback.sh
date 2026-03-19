#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${SSH_KEY_PATH:?SSH_KEY_PATH is required}"
: "${ROLLBACK_IMAGE_TAG:?ROLLBACK_IMAGE_TAG is required}"

DEPLOY_PATH="${DEPLOY_PATH:-/opt/opensocial}"

ssh -i "$SSH_KEY_PATH" \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  "$DEPLOY_USER@$DEPLOY_HOST" \
  "set -euo pipefail; \
    cd '$DEPLOY_PATH'; \
    export IMAGE_TAG='$ROLLBACK_IMAGE_TAG'; \
    docker compose -f docker-compose.prod.yml up -d api admin web workers; \
    docker compose -f docker-compose.prod.yml ps"
