import { test, expect } from "@playwright/test";
import {
  applyFindings,
  collectFindings,
  matchStoredIds,
  mergePromoterValues,
  normaliseForKey,
  venueMatches,
} from "./applyRecheckResults";
import type { ReportImage, RecheckReport } from "./applyRecheckResults";

const savedAt = (iso: string) => iso;

const storedRow = (overrides: Record<string, unknown> = {}) => ({
  id: "stored-1",
  eventName: "Elestial, G.A.G., Genie Loci",
  venueName: "Bar On The Hill",
  bucketKey: "2026-W12-4",
  flags: ["no-promoter"],
  ...overrides,
});

const afterRow = (overrides: Record<string, unknown> = {}) => ({
  eventName: "Elestial, G.A.G., Genie Loci",
  venueName: "Bar On The Hill",
  venueAddress: "University Dr, Callaghan NSW 2308",
  genres: "ROCK",
  lngLat: [151.69, -32.89],
  ticketCost: "0.00",
  eventPromoters: "Kova Events",
  flags: [],
  ...overrides,
});

const reportImage = (overrides: Partial<ReportImage> = {}): ReportImage => ({
  filePath: "/Users/sam/Downloads/thursday(29).png",
  fileName: "thursday(29).png",
  day: "thursday",
  birthtime: savedAt("2026-03-19T03:44:12.039Z"),
  bucketKey: "2026-W12-4",
  rows: [storedRow()],
  recheck: { attempted: true, afterRows: [afterRow()] },
  ...overrides,
});

const report = (images: ReportImage[]): RecheckReport => ({
  generatedAt: "2026-11-14T00:00:00.000Z",
  images,
});

test.describe("matching keys", () => {
  test("normalises case, punctuation, ampersands and a leading 'the'", () => {
    expect(normaliseForKey("The Lass O'Gowrie Hotel")).toBe("lass o gowrie hotel");
    expect(normaliseForKey("Hiss & Crackle")).toBe("hiss and crackle");
    expect(normaliseForKey("50 Clyde St.")).toBe("50 clyde st");
  });

  test("accepts venue spelling drift but not a different venue", () => {
    expect(venueMatches("King Street", "King Street Hotel")).toBe(true);
    expect(venueMatches("50 Clyde St", "50 Clyde Street")).toBe(true);
    expect(venueMatches("The Oak", "The Oak Hotel")).toBe(true);
    expect(venueMatches("Bar On The Hill", "The Prince")).toBe(false);
    expect(venueMatches("Unknown", "Bar On The Hill")).toBe(false);
  });

  test("merges comma-separated promoter values without duplicates", () => {
    expect(mergePromoterValues(["Kree-8, Witchhouse", "Kree-8"])).toEqual([
      "Kree-8",
      "Witchhouse",
    ]);
    expect(mergePromoterValues(["Thanks For Coming", "Kova Events"])).toEqual([
      "Thanks For Coming",
      "Kova Events",
    ]);
  });

  test("folds promoter spelling variants into one canonical credit", () => {
    expect(mergePromoterValues(["Kova", "Kova Events"])).toEqual(["Kova Events"]);
    expect(mergePromoterValues(["kova", "KOVA EVENTS"])).toEqual(["Kova Events"]);
    expect(mergePromoterValues(["C.T", "C.T."])).toEqual(["C.T."]);
    expect(mergePromoterValues(["made on sunday"])).toEqual(["Made On Sunday"]);
    expect(mergePromoterValues(["Thanks For Coming, Kova"])).toEqual([
      "Thanks For Coming",
      "Kova Events",
    ]);
  });
});

test.describe("collectFindings", () => {
  test("keeps rows with a promoter and rows flagged unknown-venue", () => {
    const findings = collectFindings(
      report([
        reportImage({
          recheck: {
            attempted: true,
            afterRows: [
              afterRow(),
              afterRow({ eventName: "No Promoter", eventPromoters: "" }),
              afterRow({
                eventName: "Unknown Place",
                venueName: "Unknown",
                eventPromoters: "",
                flags: ["unknown-venue"],
              }),
            ],
          },
        }),
      ]),
    );

    expect(findings.map((finding) => finding.row.eventName)).toEqual([
      "Elestial, G.A.G., Genie Loci",
      "Unknown Place",
    ]);
  });

  test("ignores images that were never attempted", () => {
    const findings = collectFindings(
      report([reportImage({ recheck: { attempted: false, afterRows: [afterRow()] } })]),
    );

    expect(findings).toEqual([]);
  });

  test("collapses the same event from two saved copies and keeps both raw values", () => {
    const findings = collectFindings(
      report([
        reportImage({ recheck: { attempted: true, afterRows: [afterRow()] } }),
        reportImage({
          fileName: "thursday(30).png",
          recheck: {
            attempted: true,
            afterRows: [afterRow({ eventPromoters: "Thanks For Coming" })],
          },
        }),
      ]),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].promoters).toEqual(["Kova Events", "Thanks For Coming"]);
    expect(findings[0].sourceValues).toEqual(["Kova Events", "Thanks For Coming"]);
  });
});

test.describe("matchStoredIds", () => {
  test("matches on venue and event name", () => {
    const [finding] = collectFindings(report([reportImage()]));
    expect(matchStoredIds(finding)).toEqual(["stored-1"]);
  });

  test("tolerates a small change in the event name", () => {
    const [finding] = collectFindings(
      report([
        reportImage({
          rows: [storedRow({ eventName: "Elestial, GAG, Genie Loci" })],
        }),
      ]),
    );

    expect(matchStoredIds(finding)).toEqual(["stored-1"]);
  });

  test("falls back to a unique event name when the venue spelling drifts", () => {
    const [finding] = collectFindings(
      report([
        reportImage({
          rows: [storedRow({ venueName: "Somewhere Else" })],
          recheck: {
            attempted: true,
            afterRows: [afterRow({ venueName: "Unknown" })],
          },
        }),
      ]),
    );

    expect(matchStoredIds(finding)).toEqual(["stored-1"]);
  });

  test("returns nothing when the bucket has no stored rows", () => {
    const [finding] = collectFindings(report([reportImage({ rows: [] })]));
    expect(matchStoredIds(finding)).toEqual([]);
  });
});

test.describe("applyFindings", () => {
  test("reuses the stored id and dates the row from the image's week", () => {
    const [applied] = applyFindings(collectFindings(report([reportImage()])));

    expect(applied.matched).toBe(true);
    expect(applied.id).toBe("stored-1");
    expect(applied.event.eventDateTime).toBe("2026-03-18T15:00:00.000Z");
    expect(applied.event.eventPromoters).toBe("Kova Events");
    expect(applied.event.source).toBe("whList");
    expect(applied.event.localTimeZone).toBe("Australia/Sydney");
  });

  test("strips audit-only fields from the research row", () => {
    const [applied] = applyFindings(collectFindings(report([reportImage()])));

    expect(applied.event).not.toHaveProperty("flags");
    expect(applied.event).not.toHaveProperty("curatedVenue");
  });

  test("creates a new event when nothing matches", () => {
    const [applied] = applyFindings(
      collectFindings(report([reportImage({ rows: [] })])),
    );

    expect(applied.matched).toBe(false);
    expect(applied.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(applied.event.eventPromoters).toBe("Kova Events");
  });

  test("gives an unmatched finding the same id on every run", () => {
    const findings = collectFindings(report([reportImage({ rows: [] })]));
    const first = applyFindings(findings);
    const second = applyFindings(findings);

    expect(second.map((entry) => entry.id)).toEqual(first.map((entry) => entry.id));
  });

  test("collapses duplicate stored rows into one event", () => {
    const applied = applyFindings(
      collectFindings(
        report([
          reportImage({
            rows: [
              storedRow({ id: "copy-a" }),
              storedRow({ id: "copy-b" }),
            ],
          }),
        ]),
      ),
    );

    expect(applied).toHaveLength(1);
    expect(applied[0].id).toBe("copy-a");
    expect(applied[0].event.eventPromoters).toBe("Kova Events");
  });

  test("merges disagreeing promoter values onto the matched row", () => {
    const applied = applyFindings(
      collectFindings(
        report([
          reportImage({ recheck: { attempted: true, afterRows: [afterRow()] } }),
          reportImage({
            fileName: "thursday(30).png",
            recheck: {
              attempted: true,
              afterRows: [afterRow({ eventPromoters: "Thanks For Coming" })],
            },
          }),
        ]),
      ),
    );

    expect(applied).toHaveLength(1);
    expect(applied[0].event.eventPromoters).toBe("Kova Events, Thanks For Coming");
    expect(applied[0].sourceValues).toEqual(["Kova Events", "Thanks For Coming"]);
  });
});
