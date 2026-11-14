import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import minimist from "minimist";
import { ScrapedEvent } from "../scrappers/types";
import { DayOfWeek, getImageEventDateTime } from "./getImageResearchData";
import {
  getResearchFileName,
  readResearchData,
  researchDataDir,
  writeResearchData,
} from "./writeToFiles";

/**
 * Folds the promoter and unknown-venue findings from a recheck report into a
 * research dump. This does not call the vision model: it reads the `afterRows`
 * already saved by `recheck-images-*.json`.
 *
 * Rows are matched back to the corpus by the image's week/weekday bucket plus
 * venue and event name, because re-extracted rows carry no date of their own.
 * When a match is found the existing `id` is reused, so merging the dumps by
 * id (as `scripts/merge-research-data.py` does) supersedes the older row rather
 * than adding a duplicate. Unmatched findings become new events.
 *
 * Usage:
 *   npm run apply-recheck -- [--report <path>] [--out YYYY-MM-DD] [--dry-run]
 */

type ReportRow = {
  id?: string;
  eventName?: string;
  venueName?: string;
  bucketKey?: string;
  flags?: string[];
};

export type AfterRow = {
  eventName?: string;
  venueName?: string;
  venueAddress?: string;
  genres?: string;
  lngLat?: number[];
  ticketCost?: string;
  eventPromoters?: string;
  flags?: string[];
};

export type ReportImage = {
  filePath: string;
  fileName: string;
  day: DayOfWeek;
  birthtime: string;
  bucketKey: string;
  rows: ReportRow[];
  recheck?: {
    attempted?: boolean;
    afterRows?: AfterRow[];
  };
};

export type RecheckReport = {
  generatedAt: string;
  images: ReportImage[];
};

export type Finding = {
  key: string;
  image: ReportImage;
  row: AfterRow;
  promoters: string[];
  sourceValues: string[];
};

export type AppliedEvent = {
  key: string;
  id: string;
  matched: boolean;
  sourceValues: string[];
  event: ScrapedEvent;
};

const UNKNOWN_VENUE_FLAG = "unknown-venue";

/**
 * Promoter spellings that the model returns inconsistently. Keys are lowercase;
 * values are the canonical credit written to research data.
 */
const PROMOTER_ALIASES: Record<string, string> = {
  kova: "Kova Events",
};

export function normaliseForKey(value?: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }

  return previous[b.length];
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return a === b ? 1 : 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

const VENUE_WORD_ALIASES: Record<string, string> = {
  st: "street",
  rd: "road",
  ave: "avenue",
  av: "avenue",
  hwy: "highway",
  dr: "drive",
  ln: "lane",
  pl: "place",
  pde: "parade",
  cres: "crescent",
  nth: "north",
  sth: "south",
};

function expandVenueWords(key: string): string {
  return key
    .split(" ")
    .map((word) => VENUE_WORD_ALIASES[word] ?? word)
    .join(" ");
}

/**
 * Venue spellings drift between passes ("50 Clyde St" / "50 Clyde Street",
 * "King Street" / "King Street Hotel"), so accept containment as well as an
 * exact key. Event name must still line up before a row is matched.
 */
export function venueMatches(a?: string, b?: string): boolean {
  const left = expandVenueWords(normaliseForKey(a));
  const right = expandVenueWords(normaliseForKey(b));

  if (!left || !right) return left === right;
  if (left === right) return true;

  const shorter = left.length <= right.length ? left : right;
  const longer = shorter === left ? right : left;
  if (shorter.length >= 3 && ` ${longer} `.includes(` ${shorter} `)) return true;

  return similarity(left, right) >= 0.82;
}

export function canonicalPromoter(value: string): string {
  const trimmed = value.trim();
  return PROMOTER_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function mergePromoterValues(values: Iterable<string>): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    for (const part of value.split(",")) {
      const promoter = canonicalPromoter(part);
      if (!promoter) continue;

      const key = promoter.toLowerCase();
      if (seen.has(key)) continue;

      seen.add(key);
      merged.push(promoter);
    }
  }

  return merged;
}

function shouldApply(row: AfterRow): boolean {
  if ((row.eventPromoters ?? "").trim()) return true;
  return (row.flags ?? []).includes(UNKNOWN_VENUE_FLAG);
}

function findingKey(image: ReportImage, row: AfterRow): string {
  return [
    image.bucketKey,
    normaliseForKey(row.venueName),
    normaliseForKey(row.eventName),
  ].join("|");
}

export function collectFindings(report: RecheckReport): Finding[] {
  const findings = new Map<string, Finding>();

  for (const image of report.images) {
    if (!image.recheck?.attempted) continue;

    for (const row of image.recheck.afterRows ?? []) {
      if (!shouldApply(row)) continue;

      const key = findingKey(image, row);
      const existing = findings.get(key);

      if (existing) {
        existing.promoters = mergePromoterValues([
          ...existing.promoters,
          row.eventPromoters ?? "",
        ]);
        const value = (row.eventPromoters ?? "").trim();
        if (value && !existing.sourceValues.includes(value)) {
          existing.sourceValues.push(value);
        }
        continue;
      }

      const value = (row.eventPromoters ?? "").trim();

      findings.set(key, {
        key,
        image,
        row,
        promoters: mergePromoterValues([value]),
        sourceValues: value ? [value] : [],
      });
    }
  }

  return [...findings.values()];
}

export function matchStoredIds(finding: Finding): string[] {
  const stored = finding.image.rows ?? [];
  if (stored.length === 0) return [];

  const eventKey = normaliseForKey(finding.row.eventName);
  const sameVenue = stored.filter((row) =>
    venueMatches(finding.row.venueName, row.venueName),
  );

  let matches = sameVenue.filter(
    (row) => normaliseForKey(row.eventName) === eventKey,
  );

  if (matches.length === 0 && sameVenue.length > 0) {
    let bestScore = 0;
    let best: ReportRow[] = [];

    for (const row of sameVenue) {
      const score = similarity(eventKey, normaliseForKey(row.eventName));
      if (score > bestScore) {
        bestScore = score;
        best = [row];
      } else if (score === bestScore && score > 0) {
        best.push(row);
      }
    }

    if (bestScore >= 0.9) matches = best;
  }

  if (matches.length === 0) {
    // A distinctive event name is enough when it occurs only once in the bucket.
    const sameEvent = stored.filter(
      (row) => normaliseForKey(row.eventName) === eventKey,
    );
    if (new Set(sameEvent.map((row) => row.id)).size === 1) matches = sameEvent;
  }

  return [...new Set(matches.map((row) => row.id).filter((id): id is string => Boolean(id)))];
}

/**
 * A new finding has no stored row to borrow an id from. Derive one from the
 * finding key and date so re-running the applier does not add the same event
 * again with a fresh random id.
 */
function deterministicId(finding: Finding, eventDateTime: string): string {
  const digest = createHash("sha1")
    .update(`recheck:${finding.key}:${eventDateTime}`)
    .digest("hex");

  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `a${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
}

function toResearchEvent(
  finding: Finding,
  overrides: { id: string; eventDateTime: string },
): ScrapedEvent {
  const row = finding.row;

  return {
    eventName: row.eventName,
    venueName: row.venueName,
    venueAddress: row.venueAddress,
    genres: row.genres,
    lngLat: row.lngLat,
    ticketCost: row.ticketCost,
    eventPromoters: finding.promoters.length
      ? finding.promoters.join(", ")
      : undefined,
    id: overrides.id,
    userName: "sam",
    userEmail: "sam@hotmail.com",
    localTimeZone: "Australia/Sydney",
    eventDateTime: overrides.eventDateTime,
    source: "whList",
  };
}

export function applyFindings(findings: Finding[]): AppliedEvent[] {
  const matchedById = new Map<
    string,
    {
      finding: Finding;
      eventDateTime: string;
      promoters: string[];
      sourceValues: string[];
    }
  >();

  const created: AppliedEvent[] = [];

  for (const finding of findings) {
    const eventDateTime = getImageEventDateTime(
      finding.image.day,
      new Date(finding.image.birthtime),
    );
    const storedIds = matchStoredIds(finding);

    if (storedIds.length === 0) {
      const id = deterministicId(finding, eventDateTime);
      created.push({
        key: finding.key,
        id,
        matched: false,
        sourceValues: [...finding.sourceValues],
        event: toResearchEvent(finding, { id, eventDateTime }),
      });
      continue;
    }

    // A stored event can appear more than once (the same row saved with
    // different ids). Enrich one copy; the merge de-duplicates by content.
    const id = storedIds[0];
    const existing = matchedById.get(id);

    if (existing) {
      // Two findings can land on the same stored row (duplicate saved
      // posters). Keep one row and union everything they found.
      existing.promoters = mergePromoterValues([
        ...existing.promoters,
        ...finding.promoters,
      ]);
      existing.sourceValues = [
        ...new Set([...existing.sourceValues, ...finding.sourceValues]),
      ];
      continue;
    }

    matchedById.set(id, {
      finding,
      eventDateTime,
      promoters: [...finding.promoters],
      sourceValues: [...finding.sourceValues],
    });
  }

  const matched: AppliedEvent[] = [...matchedById.entries()].map(
    ([id, entry]) => {
      const event = toResearchEvent(entry.finding, {
        id,
        eventDateTime: entry.eventDateTime,
      });
      event.eventPromoters = entry.promoters.length
        ? entry.promoters.join(", ")
        : undefined;

      return {
        key: entry.finding.key,
        id,
        matched: true,
        sourceValues: entry.sourceValues,
        event,
      };
    },
  );

  return [...matched, ...created];
}

function latestReportPath(): string {
  const candidates = fs
    .readdirSync(researchDataDir)
    .filter((file) => /^recheck-images-.*\.json$/.test(file))
    .map((file) => path.join(researchDataDir, file));

  if (candidates.length === 0) {
    throw new Error(`No recheck report found in ${researchDataDir}`);
  }

  return candidates.sort(
    (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs,
  )[0];
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    boolean: ["dry-run"],
    string: ["report", "out"],
  });

  const reportPath = argv.report ? path.resolve(argv.report) : latestReportPath();
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as RecheckReport;

  const findings = collectFindings(report);
  const applied = applyFindings(findings);

  const matched = applied.filter((entry) => entry.matched);
  const created = applied.filter((entry) => !entry.matched);
  const conflicted = applied.filter((entry) => entry.sourceValues.length > 1);

  console.log(`Report: ${reportPath}`);
  console.log(
    `Findings: ${findings.length} distinct promoter/unknown-venue row(s); ` +
      `${matched.length} matched existing event(s), ${created.length} new event(s).`,
  );

  if (conflicted.length > 0) {
    console.log(`Rows where the model returned more than one promoter value: ${conflicted.length}`);
    for (const entry of conflicted.slice(0, 10)) {
      console.log(`  ${entry.id} — ${entry.sourceValues.join(" / ")}`);
    }
    if (conflicted.length > 10) console.log(`  ...and ${conflicted.length - 10} more`);
  }

  if (argv["dry-run"]) {
    for (const entry of applied.slice(0, 10)) {
      console.log(
        `  ${entry.matched ? "update" : "new   "} ${entry.event.venueName} | ` +
          `${entry.event.eventDateTime} | ${entry.event.eventPromoters}`,
      );
    }
    if (applied.length > 10) console.log(`  ...and ${applied.length - 10} more`);
    console.log("Dry run. No research data was written.");
    return;
  }

  const outDate = typeof argv.out === "string" ? new Date(`${argv.out}T12:00:00`) : new Date();
  if (Number.isNaN(outDate.getTime())) throw new Error(`Invalid --out date: ${argv.out}`);

  const fileName = getResearchFileName(outDate);
  const existing = readResearchData(fileName);
  const byId = new Map(existing.events.map((event) => [event.id, event]));

  for (const entry of applied) byId.set(entry.id, entry.event);

  const processedImages = [
    ...new Set([
      ...existing.processedImages,
      ...report.images
        .filter((image) => (image.recheck?.afterRows?.length ?? 0) > 0)
        .map((image) => image.filePath),
    ]),
  ];

  writeResearchData(fileName, { processedImages, events: [...byId.values()] });

  console.log(
    `Wrote ${applied.length} event(s) to researchData/${fileName} ` +
      `(${matched.length} enriched, ${created.length} new; ${byId.size} total in file).`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
