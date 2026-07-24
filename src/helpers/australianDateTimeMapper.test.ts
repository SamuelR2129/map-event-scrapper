import { test, expect } from "@playwright/test";
import { DateTime, Settings } from "luxon";
import { australianDateTimeMapper } from "./australianDateTimeMapper";

test.describe("australianDateTimeMapper", () => {
  const FIXED_NOW = DateTime.fromISO("2025-01-15T12:00:00", {
    zone: "Australia/Sydney",
  });

  test.beforeEach(() => {
    // Freeze Luxon time
    Settings.now = () => FIXED_NOW.toMillis();
  });

  test.afterEach(() => {
    Settings.now = () => Date.now();
  });

  test("returns Monday midnight Sydney time converted to UTC", () => {
    const result = australianDateTimeMapper("monday");

    const expected = FIXED_NOW.set({ weekday: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO();

    expect(result).toBe(expected);
  });

  test("returns Friday midnight Sydney time converted to UTC", () => {
    const result = australianDateTimeMapper("friday");

    const expected = FIXED_NOW.set({ weekday: 5, hour: 0, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO();

    expect(result).toBe(expected);
  });

  test("is case-insensitive", () => {
    const lower = australianDateTimeMapper("sunday");
    const upper = australianDateTimeMapper("SUNDAY");
    const mixed = australianDateTimeMapper("SuNdAy");

    expect(lower).toBe(upper);
    expect(lower).toBe(mixed);
  });

  test("returns a valid UTC ISO string", () => {
    const result = australianDateTimeMapper("wednesday");

    const parsed = DateTime.fromISO(result, { zone: "utc" });

    expect(parsed.isValid).toBe(true);
    expect(parsed.zoneName).toBe("UTC");
  });

  test("throws for invalid day", () => {
    expect(() => australianDateTimeMapper("funday")).toThrow("Invalid day: funday");
  });

  test("uses current week when mapping weekday", () => {
    // Wednesday Jan 15, 2025 → Monday Jan 13, 2025
    const result = australianDateTimeMapper("monday");

    const parsed = DateTime.fromISO(result, { zone: "utc" }).setZone("Australia/Sydney");

    expect(parsed.weekday).toBe(1);
    expect(parsed.hour).toBe(0);
    expect(parsed.minute).toBe(0);
  });
});
