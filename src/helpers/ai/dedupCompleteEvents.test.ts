import { test, expect } from "@playwright/test";
import { aiDedupCompleteEvents, DedupResult } from "./dedupCompleteEvents";
import { ScrapedEvent } from "../../scrappers/types";

const geminiApi = require("../../apis/geminiAiApi") as {
  googleGenClient: <T>(prompt: unknown[], schema: unknown) => Promise<T | null>;
};

const stubGoogleGenClient = (result: { isSameEvent: boolean } | null): void => {
  geminiApi.googleGenClient = (async () => result) as typeof geminiApi.googleGenClient;
};

const makeEvent = (overrides: Partial<ScrapedEvent> = {}): ScrapedEvent => ({
  id: `id-${Math.random().toString(36).slice(2)}`,
  eventName: "Some local band",
  eventDateTime: "2025-06-01T10:00:00.000Z",
  lngLat: [151.780825, -32.92666],
  venueName: "The Cambridge Hotel",
  venueAddress: "789 Hunter St, Newcastle",
  source: "bandcamp",
  ...overrides,
});

test.describe("aiDedupCompleteEvents", () => {
  test("returns empty results for an empty list", async () => {
    const result = await aiDedupCompleteEvents([]);
    expect(result).toEqual({ dedupedEvents: [], removedEvents: [] });
  });

  test("removes a duplicate event matching address on the same day", async () => {
    const events = [
      makeEvent({ eventName: "First" }),
      makeEvent({ eventName: "Second", eventDateTime: "2025-06-01T22:00:00+10:00" }),
    ];

    const result = await aiDedupCompleteEvents(events);

    expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["First"]);
    expect(result.removedEvents.map((e) => e.eventName)).toEqual(["Second"]);
  });

  test("keeps events at the same address on different days", async () => {
    const events = [
      makeEvent({ eventName: "Monday Show" }),
      makeEvent({ eventName: "Saturday Show", eventDateTime: "2025-06-07T20:00:00.000Z" }),
    ];

    const result = await aiDedupCompleteEvents(events);

    expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["Monday Show", "Saturday Show"]);
    expect(result.removedEvents).toEqual([]);
  });

  test("dedupes events at the same day within 0.001 coordinate tolerance", async () => {
    const events = [
      makeEvent({ eventName: "First" }),
      makeEvent({ eventName: "Second", lngLat: [151.780925, -32.92666] }),
    ];

    const result = await aiDedupCompleteEvents(events);

    expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["First"]);
    expect(result.removedEvents.map((e) => e.eventName)).toEqual(["Second"]);
  });

  test("matches addresses case-insensitively and ignores surrounding whitespace", async () => {
    const events = [
      makeEvent({ eventName: "First" }),
      makeEvent({ eventName: "Second", venueAddress: "  789 hunter st, newcastle  " }),
    ];

    const result = await aiDedupCompleteEvents(events);

    expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["First"]);
    expect(result.removedEvents.map((e) => e.eventName)).toEqual(["Second"]);
  });

  test("keeps events whose coordinates are far apart and addresses differ", async () => {
    const events = [
      makeEvent({ eventName: "First", lngLat: [151.7, -32.9] }),
      makeEvent({ eventName: "Second", lngLat: [151.706, -32.9], venueAddress: "Somewhere else" }),
    ];

    const result = await aiDedupCompleteEvents(events);

    expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["First", "Second"]);
    expect(result.removedEvents).toEqual([]);
  });

  test("dedupes together across multiple duplicate pairs same day", async () => {
    const events = [
      makeEvent({ eventName: "First" }),
      makeEvent({ eventName: "Second", venueAddress: "789 Hunter St, Newcastle" }),
      makeEvent({ eventName: "Third", venueAddress: "789 Hunter St, Newcastle" }),
    ];

    const result = await aiDedupCompleteEvents(events);

    expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["First"]);
    expect(result.removedEvents.map((e) => e.eventName)).toEqual(["Second", "Third"]);
  });

  test.describe("fuzzy coordinate comparison using AI", () => {
    test.beforeEach(() => {
      stubGoogleGenClient({ isSameEvent: true });
    });

    test("dedupes when coordinates are fuzzy-close and the AI agrees", async () => {
      const events = [
        makeEvent({ eventName: "First", lngLat: [151.780825, -32.92666] }),
        makeEvent({ eventName: "Second", lngLat: [151.782025, -32.92666], venueAddress: "Somewhere else" }),
      ];

      const result = await aiDedupCompleteEvents(events);

      expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["First"]);
      expect(result.removedEvents.map((e) => e.eventName)).toEqual(["Second"]);
    });

    test("keeps events when the AI says they are different", async () => {
      stubGoogleGenClient({ isSameEvent: false });

      const events = [
        makeEvent({ eventName: "First", lngLat: [151.780825, -32.92666] }),
        makeEvent({ eventName: "Second", lngLat: [151.782025, -32.92666], venueAddress: "Somewhere else" }),
      ];

      const result = await aiDedupCompleteEvents(events);

      expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["First", "Second"]);
      expect(result.removedEvents).toEqual([]);
    });

    test("keeps both events when the AI returns a non-true result", async () => {
      stubGoogleGenClient(null);

      const events = [
        makeEvent({ eventName: "First", lngLat: [151.780825, -32.92666] }),
        makeEvent({ eventName: "Second", lngLat: [151.782025, -32.92666], venueAddress: "Somewhere else" }),
      ];

      const result = await aiDedupCompleteEvents(events);

      expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["First", "Second"]);
      expect(result.removedEvents).toEqual([]);
    });

    test("does not consult the AI when coordinates are close enough without help", async () => {
      let aiCalls = 0;
      geminiApi.googleGenClient = (async () => {
        aiCalls++;
        return { isSameEvent: true };
      }) as typeof geminiApi.googleGenClient;

      const events = [
        makeEvent({ eventName: "First" }),
        makeEvent({ eventName: "Second", lngLat: [151.780925, -32.92666] }),
      ];

      await aiDedupCompleteEvents(events);
      expect(aiCalls).toBe(0);
    });

    test("does not consult the AI when coordinates are too far apart", async () => {
      let aiCalls = 0;
      geminiApi.googleGenClient = (async () => {
        aiCalls++;
        return { isSameEvent: true };
      }) as typeof geminiApi.googleGenClient;

      const events = [
        makeEvent({ eventName: "First", lngLat: [151.7, -32.9] }),
        makeEvent({ eventName: "Second", lngLat: [151.706, -32.9], venueAddress: "Somewhere else" }),
      ];

      await aiDedupCompleteEvents(events);
      expect(aiCalls).toBe(0);
    });

    test("does not consult the AI when dates differ", async () => {
      let aiCalls = 0;
      geminiApi.googleGenClient = (async () => {
        aiCalls++;
        return { isSameEvent: true };
      }) as typeof geminiApi.googleGenClient;

      const events = [
        makeEvent({ eventName: "First", lngLat: [151.780825, -32.92666] }),
        makeEvent({ eventName: "Second", lngLat: [151.782025, -32.92666], eventDateTime: "2025-06-07T20:00:00.000Z", venueAddress: "Somewhere else" }),
      ];

      await aiDedupCompleteEvents(events);
      expect(aiCalls).toBe(0);
    });
  });

  test.describe("whList priority", () => {
    test("prefers non-whList events when addresses match", async () => {
      const events = [
        makeEvent({ eventName: "WhList Event", source: "whList" }),
        makeEvent({ eventName: "Other Event", source: "facebook" }),
      ];

      const result = await aiDedupCompleteEvents(events);

      expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["Other Event"]);
      expect(result.removedEvents.map((e) => e.eventName)).toEqual(["WhList Event"]);
    });

    test("removes the later event when both are whList", async () => {
      const events = [
        makeEvent({ eventName: "First WhList", source: "whList" }),
        makeEvent({ eventName: "Second WhList", source: "whList" }),
      ];

      const result = await aiDedupCompleteEvents(events);

      expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["First WhList"]);
      expect(result.removedEvents.map((e) => e.eventName)).toEqual(["Second WhList"]);
    });

    test("removes whList events even when listed after a non-whList duplicate", async () => {
      const events = [
        makeEvent({ eventName: "Other Event", source: "facebook" }),
        makeEvent({ eventName: "WhList Event", source: "whList" }),
      ];

      const result = await aiDedupCompleteEvents(events);

      expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["Other Event"]);
      expect(result.removedEvents.map((e) => e.eventName)).toEqual(["WhList Event"]);
    });
  });

  test("deduped and removed events partition the input without dropping events", async () => {
    const events = [
      makeEvent({ eventName: "First", source: "whList" }),
      makeEvent({ eventName: "Second", venueAddress: "789 Hunter St, Newcastle" }),
      makeEvent({ eventName: "Third", eventDateTime: "2025-06-07T20:00:00.000Z" }),
    ];

    const result: DedupResult = await aiDedupCompleteEvents(events);

    expect(result.dedupedEvents.length + result.removedEvents.length).toBe(events.length);
  });
});