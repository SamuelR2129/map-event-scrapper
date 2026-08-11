import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from "dotenv";
import path from "path";
import { CityConfig } from "./src/cityConfig";
dotenv.config({ path: path.resolve(__dirname, ".env") });

export type Fixtures = {
  cityConfig: CityConfig;
};

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./src/scrappers",
  /* Serve the local mock of the Nib Hotel site on the port the scraper
     expects (5173 = Vite's default). If a real dev server is already
     running there, it is reused as-is. */
  webServer: {
    command: "node scripts/serveMock.js",
    url: "http://localhost:5173/robots.txt",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  /* Run tests in files in parallel */
  fullyParallel: false,
  timeout: process.env.PW_TEST_TIMEOUT ? Number(process.env.PW_TEST_TIMEOUT) : 900_000,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["line"], ["./reporters/healer-reporter.ts"], ["html", { open: "never" }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the first retry. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    headless: false,
    actionTimeout: process.env.PW_ACTION_TIMEOUT ? Number(process.env.PW_ACTION_TIMEOUT) : 10_000,
    /* Chromium's setuid/namespace sandbox requires SYS_ADMIN + userns, which the
       hardened non-root container (--cap-drop=ALL) does not provide. */
    launchOptions: {
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "newcastle",
      use: {
        ...devices["Desktop Chrome"],
        // proxy: {
        //   server: "http://geo.iproyal.com:12321",
        //   username: "",
        //   password: "",
        // },
      },
    },
    // {
    //   name: "sydney",
    //   use: {
    //     ...devices["Desktop Firefox"],
    //     // proxy: {
    //     //   server: "http://geo.iproyal.com:12321",
    //     //   username: "",
    //     //   password: "",
    //     // },
    //   },
    // },
  ],
});
