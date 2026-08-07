#!/bin/bash
set -e

cd /app/scraper

git config --global user.email "opencode@healer.bot"
git config --global user.name "OpenCode Healer"

mkdir -p "$HOME/.config/ripgrep"
echo '--max-columns=10000' > "$HOME/.config/ripgrep/config"

cp -r /app/seed/eventFiles/* src/eventFiles/

cp -r /app/seed-scrappers/* src/scrappers/

echo "[$(date)] Running scrapers..."
npm run scrape-xvfb || true

echo "[$(date)] Enriching..."
npm run map

echo "[$(date)] Sending to DB..."
npm run send-to-db