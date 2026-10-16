import { test, expect } from "@playwright/test";
import { DateTime, Settings } from "luxon";
import { getImageEventDateTime } from "./getImageResearchData";

const sydneyDate = (iso: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone("Australia/Sydney").toISODate();

test.describe("getImageEventDateTime", () => {
  const FIXED_NOW = DateTime.fromISO("2025-01-15T12:00:00", {
    zone: "Australia/Sydney",
  });

  test.beforeEach(() => {
    Settings.now = () => FIXED_NOW.toMillis();
  });

  test.afterEach(() => {
    Settings.now = () => Date.now();
  });

  test("resolves each day within the week the image was saved", () => {
    // Wed 7 Jan 2026 (local calendar date of the file's birthtime)
    const saved = new Date(2026, 0, 7, 12, 0, 0);

    expect(sydneyDate(getImageEventDateTime("wednesday", saved))).toBe("2026-01-07");
    expect(sydneyDate(getImageEventDateTime("thursday", saved))).toBe("2026-01-08");
    expect(sydneyDate(getImageEventDateTime("friday", saved))).toBe("2026-01-09");
    expect(sydneyDate(getImageEventDateTime("saturday", saved))).toBe("2026-01-10");
    expect(sydneyDate(getImageEventDateTime("sunday", saved))).toBe("2026-01-11");
  });

  test("keeps the target day in the same ISO week as the saved date", () => {
    // saved on Monday, before the target day
    expect(sydneyDate(getImageEventDateTime("friday", new Date(2026, 0, 5, 9)))).toBe("2026-01-09");
    // saved on Tuesday, list published ahead of Wednesday
    expect(sydneyDate(getImageEventDateTime("wednesday", new Date(2026, 0, 6, 9)))).toBe("2026-01-07");
    // saved after the target day, still the same week
    expect(sydneyDate(getImageEventDateTime("wednesday", new Date(2026, 0, 9, 9)))).toBe("2026-01-07");
    // saved on Sunday, end of the week
    expect(sydneyDate(getImageEventDateTime("sunday", new Date(2026, 0, 11, 9)))).toBe("2026-01-11");
  });

  test("ignores the current date entirely", () => {
    // Settings.now is frozen to 2025, but the image was saved in 2026
    expect(sydneyDate(getImageEventDateTime("wednesday", new Date(2026, 0, 7, 12)))).toBe("2026-01-07");
  });

  test("returns a valid UTC ISO string at 2am Sydney", () => {
    const iso = getImageEventDateTime("saturday", new Date(2026, 0, 7, 12));

    const parsed = DateTime.fromISO(iso, { zone: "utc" });
    expect(parsed.isValid).toBe(true);
    expect(parsed.zoneName).toBe("UTC");
    expect(sydneyDate(iso)).toBe("2026-01-10");
    expect(parsed.setZone("Australia/Sydney").hour).toBe(2);
  });

  test("throws for a day not supported by image research", () => {
    expect(() => getImageEventDateTime("funday" as never, new Date(2026, 0, 7, 12))).toThrow(
      "Invalid day for image research: funday",
    );
  });
});
