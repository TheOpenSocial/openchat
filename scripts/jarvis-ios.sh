#!/usr/bin/env bash
# Build native iOS, ensure Metro is up, then install/run on a named device.
# Usage: pnpm jarvis
# Optional: JARVIS_IOS_DEVICE="My iPhone" pnpm jarvis

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
DEVICE="${JARVIS_IOS_DEVICE:-Jarvis mobile}"
METRO_PORT="${EXPO_METRO_PORT:-8081}"
METRO_URL="http://127.0.0.1:${METRO_PORT}/status"

cd "$MOBILE"

echo ">> expo prebuild --platform ios"
pnpm exec expo prebuild --platform ios

# Local device signing often uses a team provisioning profile without Push capability.
# expo-notifications may re-add aps-environment during prebuild; strip it for local debug runs.
ENTITLEMENTS_FILE="$MOBILE/ios/OpenSocial/OpenSocial.entitlements"
if [[ -f "$ENTITLEMENTS_FILE" ]]; then
  if /usr/libexec/PlistBuddy -c "Print :aps-environment" "$ENTITLEMENTS_FILE" >/dev/null 2>&1; then
    echo ">> removing aps-environment entitlement for local debug signing"
    /usr/libexec/PlistBuddy -c "Delete :aps-environment" "$ENTITLEMENTS_FILE" || true
  fi
fi

METRO_PID=""
stop_metro() {
  if [[ -n "${METRO_PID}" ]] && kill -0 "${METRO_PID}" 2>/dev/null; then
    echo ">> stopping Metro (pid ${METRO_PID})"
    kill "${METRO_PID}" 2>/dev/null || true
    wait "${METRO_PID}" 2>/dev/null || true
  fi
}
trap stop_metro INT TERM

echo ">> starting Metro on port ${METRO_PORT}"
pnpm exec expo start --port "${METRO_PORT}" &
METRO_PID=$!

echo ">> waiting for Metro at ${METRO_URL}"
for _ in $(seq 1 90); do
  if curl -sf --max-time 1 "${METRO_URL}" | grep -qi running; then
    echo ">> Metro is running"
    break
  fi
  sleep 1
done

if ! curl -sf --max-time 1 "${METRO_URL}" | grep -qi running; then
  echo "error: Metro did not become ready at ${METRO_URL}" >&2
  stop_metro
  exit 1
fi

# Note: `expo run:ios` rejects `--port` together with `--no-bundler`; Metro's port is
# whatever `expo start --port` uses (default 8081). The dev client reads the standard port.
echo ">> expo run:ios --device \"${DEVICE}\" --no-bundler"
if ! pnpm exec expo run:ios --device "${DEVICE}" --no-bundler; then
  stop_metro
  exit 1
fi

echo ">> Metro still running for fast refresh (pid ${METRO_PID}). Press Ctrl+C to stop."
wait "${METRO_PID}"
