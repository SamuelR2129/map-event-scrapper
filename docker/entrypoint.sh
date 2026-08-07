#!/bin/bash
set -e

cd /app/scraper

git config --global user.email "opencode@healer.bot"
git config --global user.name "OpenCode Healer"

mkdir -p "$HOME/.config/ripgrep"
echo '--max-columns=10000' > "$HOME/.config/ripgrep/config"

# --- Egress allowlist proxy -----------------------------------------------
# Every outbound connection (Playwright browser, Node fetch/@google/genai, git,
# curl, opencode healer CLI) is routed through this proxy; it only forwards
# connections to hosts listed on the allowlist baked into the image.
EGRESS_PORT="${EGRESS_PORT:-7443}"
export EGRESS_ALLOWLIST="${EGRESS_ALLOWLIST:-/usr/local/etc/egress-allowlist.txt}"
export EGRESS_PROXY_SERVER="http://127.0.0.1:${EGRESS_PORT}"
export HTTP_PROXY="$EGRESS_PROXY_SERVER"
export HTTPS_PROXY="$EGRESS_PROXY_SERVER"
export http_proxy="$EGRESS_PROXY_SERVER"
export https_proxy="$EGRESS_PROXY_SERVER"
export NO_PROXY="127.0.0.1,localhost,::1"
export no_proxy="127.0.0.1,localhost,::1"
# Node >=24: make undici's global fetch honor HTTP(S)_PROXY
export NODE_OPTIONS="${NODE_OPTIONS:-} --use-env-proxy"

node_modules/.bin/ts-node src/egress/allowlist-proxy.ts &
EGRESS_PROXY_PID=$!
trap 'kill "$EGRESS_PROXY_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 50); do
  if (echo > "/dev/tcp/127.0.0.1/${EGRESS_PORT}") 2>/dev/null; then
    break
  fi
  sleep 0.1
done

# Seed the writable eventFiles directory (mounted as tmpfs, starts empty)
cp -r /app/seed/eventFiles/* src/eventFiles/

# Seed the writable scrappers directory for test healing
cp -r /app/seed-scrappers/* src/scrappers/

echo "[$(date)] Running scrapers..."
npm run scrape-xvfb || true

echo "[$(date)] Enriching..."
npm run map

echo "[$(date)] Sending to DB..."
npm run send-to-db