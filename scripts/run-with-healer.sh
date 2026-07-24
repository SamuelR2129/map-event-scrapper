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

The project is at $PROJECT_DIR. Do not ask questions — fix the tests."; then
    echo "[HEALER] opencode failed on attempt $attempt/$MAX_RETRIES"
    if [ $attempt -lt $MAX_RETRIES ]; then
      sleep $RETRY_DELAY
      RETRY_DELAY=$((RETRY_DELAY + 10))
    fi
    continue
  fi

  echo "[HEALER] opencode completed, verifying fix..."

  if npx playwright test "${HEALER_TEST_FILE}" --output=/tmp/test-results 2>/dev/null; then
    echo "[HEALER] Verified on attempt $attempt/$MAX_RETRIES — test passes"
    exit 0
  fi

  echo "[HEALER] Verification failed on attempt $attempt/$MAX_RETRIES — test still failing"

  if [ $attempt -lt $MAX_RETRIES ]; then
    echo "[HEALER] Retrying in ${RETRY_DELAY}s..."
    sleep $RETRY_DELAY
    RETRY_DELAY=$((RETRY_DELAY + 10))
  fi
done

echo "[HEALER] All $MAX_RETRIES attempts exhausted"
exit 1