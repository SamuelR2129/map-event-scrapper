# Specs

This directory stores scraping plans and test plans.

## Web Scraper Agents

Two opencode subagents are available for building event scrappers that extract `ScrapedEvent[]`.

### 1. `playwright-test-planner` — Explore & Plan

Navigates a target event listing website, analyzes its structure, and produces a scraping plan with selectors and extraction strategies for each `ScrapedEvent` field.

```
opencode --agent playwright-test-planner "plan how to scrape ScrapedEvent[] from https://example.com/events"
```

The plan is saved via `planner_save_plan` into this directory.

### 2. `playwright-test-generator` — Generate Scraper Code

Takes a scraping plan, uses Playwright browser tools to walk through the extraction steps in real-time, and writes a `.spec.ts` file into `src/scrappers/` following the existing project patterns (custom fixtures, `sanitizeAndWriteToStagingFile`, duplicate detection, etc.).

```
opencode run "generate the hamiltonStationHotel scraper using the plan from the previous session from https://www.thehamiltonstationhotel.com/music"
```

### Usage Order

1. **Plan** — run `playwright-test-planner` on the target website to produce an extraction strategy
2. **Generate** — run `playwright-test-generator` with that plan to produce the scraper test file
3. **Run** — execute the generated scraper via `npx playwright test src/scrappers/<name>.spec.ts --project=<city>`
