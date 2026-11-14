import { test, expect } from "@playwright/test";
import type { ImageFile } from "./getImageResearchData";
import {
  auditImages,
  classifyEvent,
  eventBucketKey,
  findCuratedVenue,
  formatBucketKey,
  imageBucketKey,
  isUncuratedVenue,
  isUnknownVenue,
  normaliseVenueKey,
  summariseRows,
} from "./recheckWeeklyImages";
import type { AuditEvent } from "./recheckWeeklyImages";

const savedAt = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12, 0, 0);

const row = (overrides: AuditEvent = {}): AuditEvent => ({
  venueName: "Lass O'Gowrie",
  eventPromoters: "Bad Behaviour",
  lngLat: [151.75, -32.92],
  ...overrides,
});

const image = (overrides: Partial<ImageFile> = {}): ImageFile => ({
  filePath: "/tmp/friday(1).png",
  day: "wednesday",
  birthtime: savedAt(2026, 1, 7),
  ...overrides,
});

test.describe("bucket keys", () => {
  test("an image's bucket is the ISO week and weekday of its resolved event date", () => {
    expect(imageBucketKey("wednesday", savedAt(2026, 1, 7))).toBe("2026-W02-3");
    expect(imageBucketKey("sunday", savedAt(2026, 1, 7))).toBe("2026-W02-7");
  });

  test("rows and images meet in the same bucket across the UTC/Sydney boundary", () => {
    // Wed 7 Jan 2026, 02:00 Australia/Sydney
    expect(eventBucketKey("2026-01-06T15:00:00.000Z")).toBe(imageBucketKey("wednesday", savedAt(2026, 1, 7)));

    // Sun 11 Jan 2026, 02:00 Australia/Sydney
    expect(eventBucketKey("2026-01-10T15:00:00.000Z")).toBe(imageBucketKey("sunday", savedAt(2026, 1, 7)));
  });

  test("a row without a usable date has no bucket", () => {
    expect(eventBucketKey(undefined)).toBeUndefined();
    expect(eventBucketKey("")).toBeUndefined();
    expect(eventBucketKey("not-a-date")).toBeUndefined();
  });

  test("bucket keys render readably", () => {
    expect(formatBucketKey("2026-W02-3")).toBe("2026 W02 Wed");
    expect(formatBucketKey("nonsense")).toBe("nonsense");
  });
});

test.describe("venue matching", () => {
  test("normalises case, punctuation, ampersands and a leading 'the'", () => {
    expect(normaliseVenueKey("The Lass O'Gowrie Hotel")).toBe("lass ogowrie hotel");
    expect(normaliseVenueKey("Bernie's Bar")).toBe("bernies bar");
    expect(normaliseVenueKey("Stag & Hunter")).toBe("stag and hunter");
  });

  test("finds curated venues when the names differ slightly", () => {
    expect(findCuratedVenue("Lass O'Gowrie")?.venueName).toBe("Lass O'Gowrie Hotel");
    expect(findCuratedVenue("The Ori")?.venueName).toBe("Ori");
    expect(findCuratedVenue("Croatian Club")?.venueName).toBe("Croatian");
    expect(findCuratedVenue("Bernie's Bar")?.venueName).toBe("Bernies Bar");
  });

  test("returns nothing for a venue that is not curated", () => {
    expect(findCuratedVenue("Some New Bar")).toBeUndefined();
    expect(findCuratedVenue()).toBeUndefined();
  });
});

test.describe("flag classification", () => {
  test("a known venue with a promoter and coordinates is clean", () => {
    expect(classifyEvent(row())).toEqual([]);
  });

  test("an unknown location needs the name, the coordinates and the curated lookup to all fail", () => {
    expect(isUnknownVenue({ venueName: "Unknown" })).toBe(true);
    expect(isUnknownVenue({ venueName: "" })).toBe(true);
    expect(isUnknownVenue({ venueName: "Unknown", lngLat: [151.75, -32.92] })).toBe(false);
    expect(isUnknownVenue({ venueName: "Lass O'Gowrie" })).toBe(false);
    expect(isUnknownVenue({ venueName: "Some New Bar" })).toBe(false);
  });

  test("reports each gap on the row", () => {
    expect(classifyEvent({ venueName: "Unknown" })).toEqual(["no-promoter", "unknown-venue"]);
    expect(
      classifyEvent({
        venueName: "Bad Behaviour - Lass O'Gowrie",
        eventPromoters: "Bad Behaviour",
        lngLat: [151.75, -32.92],
      }),
    ).toEqual(["promoter-in-venue"]);
  });

  test("missing coordinates are context, not a re-extraction trigger", () => {
    expect(classifyEvent({ venueName: "Some New Bar", eventPromoters: "Someone" })).toEqual([]);
    expect(classifyEvent({ venueName: "Lass O'Gowrie", eventPromoters: "Someone" })).toEqual([]);
  });

  test("an uncurated but named venue is report-only, not a trigger on its own", () => {
    expect(isUncuratedVenue("Some New Bar")).toBe(true);
    expect(isUncuratedVenue("Lass O'Gowrie")).toBe(false);
    expect(isUncuratedVenue("Unknown")).toBe(false);
    expect(isUncuratedVenue()).toBe(false);
  });
});

test.describe("auditImages", () => {
  test("links rows to an image by bucket and flags the gaps", () => {
    const processed = new Set(["/tmp/friday(1).png"]);
    const result = auditImages(
      [image()],
      [
        row({ eventDateTime: "2026-01-06T15:00:00.000Z", eventPromoters: undefined, lngLat: undefined }),
        row({ eventDateTime: undefined }),
      ],
      processed,
    );

    expect(result.images).toHaveLength(1);
    expect(result.images[0].rowsInBucket).toBe(1);
    expect(result.images[0].processed).toBe(true);
    expect(result.images[0].reasons).toEqual(["no-promoter"]);
    expect(result.images[0].rows[0].flags).toEqual(["no-promoter"]);
    expect(result.unbucketedRows).toHaveLength(1);
  });

  test("flags a processed image whose bucket produced no rows", () => {
    const result = auditImages([image()], [], new Set(["/tmp/friday(1).png"]));

    expect(result.images[0].rowsInBucket).toBe(0);
    expect(result.images[0].reasons).toEqual(["no-extracted-events"]);
  });

  test("flags an image that was never processed", () => {
    const result = auditImages([image()], [], new Set());

    expect(result.images[0].reasons).toContain("not-processed");
    expect(result.images[0].reasons).toContain("no-extracted-events");
  });

  test("row statistics separate unknown, uncurated and missing-coordinate rows", () => {
    const stats = summariseRows([
      row(),
      row({ eventPromoters: undefined }),
      row({ venueName: "Some New Bar", lngLat: undefined, eventPromoters: "Someone" }),
      row({ venueName: "Unknown", lngLat: undefined, eventPromoters: undefined }),
    ]);

    expect(stats).toEqual({
      rows: 4,
      withPromoter: 2,
      curatedVenue: 2,
      uncuratedVenue: 1,
      unknownVenue: 1,
      missingCoords: 2,
    });
  });
});
