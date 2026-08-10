#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if ! command -v opencode &>/dev/null; then
  echo "[HEALER] opencode not found — skipping healer for ${HEALER_TEST_NAME:-unknown}"
  exit 0
fi

MAX_RETRIES=3
RETRY_DELAY=5

for attempt in $(seq 1 $MAX_RETRIES); do
  echo "[HEALER] Attempt $attempt/$MAX_RETRIES for '${HEALER_TEST_NAME:-unknown}'"

  if ! opencode run --agent playwright-test-healer \
    --auto \
    --dir "$PROJECT_DIR" \
    "The test '${HEALER_TEST_NAME:-unknown}' in ${HEALER_TEST_FILE:-unknown} failed.

${HEALER_ERROR:-unknown error}

The project is at $PROJECT_DIR. Do not ask questions — fix the tests. The healer verifies the fix itself via the test_run tool."; then
    echo "[HEALER] opencode failed on attempt $attempt/$MAX_RETRIES"
    if [ $attempt -lt $MAX_RETRIES ]; then
      sleep $RETRY_DELAY
      RETRY_DELAY=$((RETRY_DELAY + 10))
    fi
    continue
  fi

  echo "[HEALER] opencode completed and verified the fix on attempt $attempt/$MAX_RETRIES"
  exit 0
done

echo "[HEALER] All $MAX_RETRIES attempts exhausted"
exit 1