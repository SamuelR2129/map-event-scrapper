#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

export DISPLAY=:0
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:$PATH"
export NODE_ENV=production

SENTINEL_FILE="logs/$(date +%Y-%m-%d)-pipeline-done"

if [ -f "$SENTINEL_FILE" ]; then
  echo "[$(date)] Pipeline already ran today. Skipping."
  exit 0
fi

echo "[$(date)] === Step 1: Download weekly Instagram photos ==="
xvfb-run npx playwright test src/scrappers/witchhouseNewcastle.spec.ts --reporter=line

png_count=$(ls -1 src/eventFiles/weeklyPhotos/*.png 2>/dev/null | wc -l)
if [ "$png_count" -eq 0 ]; then
  echo "[$(date)] No photos downloaded — Instagram hasn't uploaded this week's images yet. Skipping."
  exit 0
fi
echo "[$(date)] Downloaded $png_count photos."

echo "[$(date)] === Step 2: Map staging events to complete ==="
npm run images

echo "[$(date)] === Step 3: Send complete events to production DB ==="
npm run send-to-db

touch "$SENTINEL_FILE"
echo "[$(date)] === Pipeline complete ==="
