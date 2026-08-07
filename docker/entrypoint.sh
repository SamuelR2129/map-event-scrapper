#!/bin/bash
set -e

cd /app/scraper

git config --global user.email "opencode@healer.bot"
git config --global user.name "OpenCode Healer"

mkdir -p "$HOME/.config/ripgrep"
echo '--max-columns=10000' > "$HOME/.config/ripgrep/config"

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