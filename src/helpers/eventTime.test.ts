import { test, expect } from "@playwright/test";
import { partitionPastAndUpcoming } from "./eventTime";

const NOW = new Date("2026-11-18T00:00:00.000Z");

const event = (eventName: string, eventDateTime?: string) => ({ eventName, eventDateTime });

test.describe("partitionPastAndUpcoming", () => {
  test("splits on the date of each event, not on the last event in the list", () => {
    const staging = [
      event("past early", "2026-10-30T08:30:00.000Z"),
      event("future", "2026-11-22T05:00:00.000Z"),
      event("past late", "2026-11-01T09:00:00.000Z"),
    ];

    const { past, upcoming } = partitionPastAndUpcoming(staging, NOW);

    expect(past.map((e) => e.eventName)).toEqual(["past early", "past late"]);
    expect(upcoming.map((e) => e.eventName)).toEqual(["future"]);
  });

  test("keeps unsorted groups intact and drops nothing", () => {
    const staging = [
      event("a", "2026-11-20T00:00:00.000Z"),
      event("b", "2026-11-17T00:00:00.000Z"),
      event("c", "2026-12-24T00:00:00.000Z"),
    ];

    const { past, upcoming } = partitionPastAndUpcoming(staging, NOW);

    expect(past.length + upcoming.length).toBe(staging.length);
    expect(past.map((e) => e.eventName)).toEqual(["b"]);
    expect(upcoming.map((e) => e.eventName)).toEqual(["a", "c"]);
  });

  test("treats an event starting exactly now as upcoming", () => {
    const { past, upcoming } = partitionPastAndUpcoming([event("now", NOW.toISOString())], NOW);

    expect(past).toHaveLength(0);
    expect(upcoming).toHaveLength(1);
  });

  test("keeps events with no eventDateTime so they are never silently dropped", () => {
    const { past, upcoming } = partitionPastAndUpcoming([event("undated"), event("past", "2020-01-01T00:00:00.000Z")], NOW);

    expect(past.map((e) => e.eventName)).toEqual(["past"]);
    expect(upcoming.map((e) => e.eventName)).toEqual(["undated"]);
  });

  test("ignores an unparseable eventDateTime rather than treating it as past", () => {
    const { past, upcoming } = partitionPastAndUpcoming([event("bad date", "not-a-date")], NOW);

    expect(past).toHaveLength(0);
    expect(upcoming).toHaveLength(1);
  });
});
