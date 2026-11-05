import { defineConfig } from "@playwright/test";

/**
 * Unit tests for pure helpers. The scraper config narrows `testDir` to
 * `./src/scrappers`, which leaves `*.test.ts` files elsewhere uncollected.
 */
export default defineConfig({
  testDir: "./src/helpers",
  testMatch: "**/*.test.ts",
  fullyParallel: true,
  timeout: 60_000,
  reporter: [["line"]],
  use: {
    headless: true,
  },
});
