import { test, expect } from "@playwright/test";
import { aiDedupCompleteEvents, DedupResult, namesAreSimilar, venuesAreSimilar } from "./dedupCompleteEvents";
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

test.describe("namesAreSimilar", () => {
  test("treats identical names, modulo punctuation and case, as the same", () => {
    expect(namesAreSimilar("METANOIA - Live at the Gladstone", "metanoia live at the gladstone")).toBe(true);
    expect(namesAreSimilar("Club 77: DJ Kiti", "Club 77 — DJ Kiti")).toBe(true);
  });

  test("treats a fully contained name as the same event", () => {
    expect(namesAreSimilar("The Roadshow Ft Kingswood & Friends - FREE ENTRY", "The Roadshow Ft Kingswood & Friends")).toBe(
      true,
    );
  });

  test("keeps different billings at the same venue apart", () => {
    expect(namesAreSimilar("[UNHINGED] Fridays @ Side Bar // Free Entry Anytime", "Ultimate Fridays: Free Entry @ Side Bar")).toBe(
      false,
    );
    expect(namesAreSimilar("SUTRA SUNRISE", "Homemade Saturdays - 21st November 2026")).toBe(false);
    expect(namesAreSimilar("Club 77: DJ Kiti, Barney Kato", "90s & 00s Club Classics - Over 30s")).toBe(false);
  });

  test("returns false when either name is missing", () => {
    expect(namesAreSimilar(undefined, "Some event")).toBe(false);
    expect(namesAreSimilar("Some event", undefined)).toBe(false);
  });
});

test.describe("venuesAreSimilar", () => {
  test("ignores leading articles", () => {
    expect(venuesAreSimilar("The Stag & Hunter Hotel", "Stag and Hunter Hotel")).toBe(true);
  });

  test("does not merge different rooms or neighbouring venues", () => {
    expect(venuesAreSimilar("Home Rooftop", "Home Main Venue")).toBe(false);
    expect(venuesAreSimilar("CULT", "Mansions Potts Point")).toBe(false);
  });
});

test.describe("aiDedupCompleteEvents", () => {
  test.beforeEach(() => {
    // Default: the AI is unavailable/disagrees, so nothing is removed without a strong signal.
    stubGoogleGenClient({ isSameEvent: false });
  });

  test("returns empty results for an empty list", async () => {
    const result = await aiDedupCompleteEvents([]);
    expect(result).toEqual({ dedupedEvents: [], removedEvents: [] });
  });

  test("removes an event with the same name and address on the same day", async () => {
    const events = [
      makeEvent({ eventName: "Some local band" }),
      makeEvent({ eventName: "Some local band", eventDateTime: "2025-06-01T22:00:00+10:00" }),
    ];

    const result = await aiDedupCompleteEvents(events);

    expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["Some local band"]);
    expect(result.removedEvents.map((e) => e.eventName)).toEqual(["Some local band"]);
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

  test("dedupes same-name events within 0.001 coordinate tolerance", async () => {
    const events = [
      makeEvent({ eventName: "Some local band" }),
      makeEvent({ eventName: "Some local band", lngLat: [151.780925, -32.92666], venueAddress: "Elsewhere" }),
    ];

    const result = await aiDedupCompleteEvents(events);

    expect(result.dedupedEvents).toHaveLength(1);
    expect(result.removedEvents).toHaveLength(1);
  });

  test("matches addresses case-insensitively and ignores surrounding whitespace", async () => {
    const events = [
      makeEvent({ eventName: "Some local band" }),
      makeEvent({ eventName: "Some local band", venueAddress: "  789 hunter st, newcastle  " }),
    ];

    const result = await aiDedupCompleteEvents(events);

    expect(result.dedupedEvents).toHaveLength(1);
    expect(result.removedEvents).toHaveLength(1);
  });

  test("keeps different events at the same venue on the same night", async () => {
    // The regression this guards: Side Bar on a Friday lists several separate nights.
    const events = [
      makeEvent({ eventName: "[UNHINGED] Fridays @ Side Bar // Free Entry Anytime", venueName: "Side Bar" }),
      makeEvent({ eventName: "Ultimate Fridays: Free Entry @ Side Bar", venueName: "Side Bar" }),
    ];

    const result = await aiDedupCompleteEvents(events);

    expect(result.dedupedEvents.map((e) => e.eventName)).toEqual([
      "[UNHINGED] Fridays @ Side Bar // Free Entry Anytime",
      "Ultimate Fridays: Free Entry @ Side Bar",
    ]);
    expect(result.removedEvents).toEqual([]);
  });

  test("keeps different venues a stone's throw apart on the same night", async () => {
    // CULT and Mansions Potts Point are ~55m apart but are different rooms.
    const events = [
      makeEvent({
        eventName: "La Cueva Superclub Sydney | SAT 21 NOV",
        venueName: "CULT",
        lngLat: [151.224451, -33.875092],
        venueAddress: "CULT, Potts Point",
      }),
      makeEvent({
        eventName: "LUV RE$PON$IBLY",
        venueName: "Mansions Potts Point",
        lngLat: [151.224985, -33.874682],
        venueAddress: "Mansions, Potts Point",
      }),
    ];

    const result = await aiDedupCompleteEvents(events);

    expect(result.dedupedEvents).toHaveLength(2);
    expect(result.removedEvents).toEqual([]);
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

  test("dedupes multiple same-name entries against the first", async () => {
    const events = [
      makeEvent({ eventName: "Some local band" }),
      makeEvent({ eventName: "Some local band" }),
      makeEvent({ eventName: "Some local band" }),
    ];

    const result = await aiDedupCompleteEvents(events);

    expect(result.dedupedEvents).toHaveLength(1);
    expect(result.removedEvents).toHaveLength(2);
  });

  test.describe("AI comparison", () => {
    test("removes the duplicate when the AI agrees", async () => {
      stubGoogleGenClient({ isSameEvent: true });

      const events = [
        makeEvent({ eventName: "Young Henrys x Kingswood Roadshow: Stag & Hunter", venueName: "Stag & Hunter Hotel" }),
        makeEvent({ eventName: "The Roadshow Ft Kingswood & Friends - FREE ENTRY", venueName: "The Stag & Hunter Hotel" }),
      ];

      const result = await aiDedupCompleteEvents(events);

      expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["Young Henrys x Kingswood Roadshow: Stag & Hunter"]);
      expect(result.removedEvents).toHaveLength(1);
    });

    test("keeps both events when the AI returns null", async () => {
      stubGoogleGenClient(null);

      const events = [
        makeEvent({ eventName: "First", lngLat: [151.780825, -32.92666] }),
        makeEvent({ eventName: "Second", lngLat: [151.782025, -32.92666], venueAddress: "Somewhere else" }),
      ];

      const result = await aiDedupCompleteEvents(events);

      expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["First", "Second"]);
      expect(result.removedEvents).toEqual([]);
    });

    test("does not consult the AI when names and venues match", async () => {
      let aiCalls = 0;
      geminiApi.googleGenClient = (async () => {
        aiCalls++;
        return { isSameEvent: true };
      }) as typeof geminiApi.googleGenClient;

      const events = [
        makeEvent({ eventName: "Some local band" }),
        makeEvent({ eventName: "Some local band", lngLat: [151.780925, -32.92666] }),
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
        makeEvent({ eventName: "First", lngLat: [151.7, -32.9], venueName: "The Cambridge Hotel" }),
        makeEvent({
          eventName: "Second",
          lngLat: [151.706, -32.9],
          venueAddress: "Somewhere else",
          venueName: "Hamilton Station Hotel",
        }),
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
        makeEvent({ eventName: "First" }),
        makeEvent({ eventName: "Second", eventDateTime: "2025-06-07T20:00:00.000Z" }),
      ];

      await aiDedupCompleteEvents(events);
      expect(aiCalls).toBe(0);
    });
  });

  test.describe("whList priority", () => {
    test.beforeEach(() => {
      stubGoogleGenClient({ isSameEvent: true });
    });

    test("prefers non-whList events when they are the same event", async () => {
      const events = [
        makeEvent({ eventName: "Some local band", source: "whList" }),
        makeEvent({ eventName: "Some local band", source: "facebook" }),
      ];

      const result = await aiDedupCompleteEvents(events);

      expect(result.dedupedEvents.map((e) => e.eventName)).toEqual(["Some local band"]);
      expect(result.removedEvents.map((e) => e.source)).toEqual(["whList"]);
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
      makeEvent({ eventName: "Second" }),
      makeEvent({ eventName: "Third", eventDateTime: "2025-06-07T20:00:00.000Z" }),
    ];

    const result: DedupResult = await aiDedupCompleteEvents(events);

    expect(result.dedupedEvents.length + result.removedEvents.length).toBe(events.length);
  });
});
