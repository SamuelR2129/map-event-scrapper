#!/bin/bash
set -e

cd /app/scraper

# Seed the writable eventFiles directory (mounted as tmpfs, starts empty)
cp -r /app/seed/eventFiles/* src/eventFiles/

# Seed the writable scrappers directory for test healing
cp -r /app/seed-scrappers/* src/scrappers/

echo "[$(date)] Running scrapers..."
npm run scrape-xvfb

echo "[$(date)] Enriching..."
npm run map

# echo "[$(date)] Sending to DB..."
# npm run send-to-db
