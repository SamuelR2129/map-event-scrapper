/**
 * Recheck the weekly poster images against the stored research rows.
 *
 * The research run (`npm run research`) extracts rows once and never revisits
 * an image. That leaves two persistent gaps in `researchData/events-*.json`:
 * rows with no promoter, and rows whose venue could not be resolved. This
 * script audits the stored corpus, flags the images that produced rows with
 * those gaps, and (unless `--dry-run`) re-extracts just those images.
 *
 * It is read-only with respect to the pipeline: it never touches
 * `processed-images.json` or the `events-*.json` dumps. The only files it
 * writes are its own report, `researchData/recheck-images-<date>.json` and
 * `.md`.
 *
 * Usage:
 *   npm run recheck -- --dry-run          # audit only, no API calls
 *   npm run recheck -- --limit 10         # re-extract the 10 highest-priority images
 *   npm run recheck -- --year 2026        # which Downloads batch to scan
 *
 * Rows carry no image path, so an image is linked to rows by bucket: the
 * (ISO week, weekday) of the image's resolved event date must match the
 * (ISO week, weekday) of the row's `eventDateTime` in Australia/Sydney.
 */

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import minimist from "minimist";
import { DateTime } from "luxon";
import { extractEventData } from "./extractEventsFromImages";
import {
  DayOfWeek,
  getImageEventDateTime,
  getWeeklyImagesFromDownloads,
  ImageFile,
} from "./getImageResearchData";
import { normalisePromoterAndVenue } from "./promoters";
import venueLocationsJson from "./venueLocations.json";
import { readResearchData, researchDataDir } from "./writeToFiles";

const SYDNEY = "Australia/Sydney";

export type VenueLocation = {
  venueName: string;
  venueAddress: string;
  lngLat: number[];
};

export const VENUE_LOCATIONS = venueLocationsJson as VenueLocation[];

/** The subset of a research row this audit reads. Both ScrapedEvent and the model's raw event fit. */
export type AuditEvent = {
  id?: string;
  eventName?: string;
  venueName?: string;
  eventPromoters?: string;
  eventDateTime?: string;
  lngLat?: number[];
};

export type RowFlag = "no-promoter" | "unknown-venue" | "promoter-in-venue";

export type ImageFlag = RowFlag | "no-extracted-events" | "not-processed";

const WEEKDAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const UNKNOWN_VENUE = /^(unknown|tba|tbc|n\/?a|none)$/i;

// ---------------------------------------------------------------- pure helpers

export function bucketKey(dateTime: DateTime): string {
  const week = String(dateTime.weekNumber).padStart(2, "0");
  return `${dateTime.weekYear}-W${week}-${dateTime.weekday}`;
}

export function imageBucketKey(day: DayOfWeek, birthtime: Date): string {
  const eventDateTime = getImageEventDateTime(day, birthtime);
  return bucketKey(DateTime.fromISO(eventDateTime, { zone: "utc" }).setZone(SYDNEY));
}

export function eventBucketKey(eventDateTime?: string): string | undefined {
  if (!eventDateTime) return undefined;

  const parsed = DateTime.fromISO(eventDateTime, { setZone: true });
  if (!parsed.isValid) return undefined;

  return bucketKey(parsed.setZone(SYDNEY));
}

export function formatBucketKey(key: string): string {
  const match = /^(\d{4})-W(\d{2})-(\d)$/.exec(key);
  if (!match) return key;

  const weekday = Number(match[3]);
  return `${match[1]} W${match[2]} ${WEEKDAY_LABELS[weekday] ?? match[3]}`;
}

export function hasValidLngLat(value?: number[]): boolean {
  return Array.isArray(value) && value.length === 2 && value.every((n) => Number.isFinite(n));
}

/**
 * `Lass O'Gowrie`, `The Lass O'Gowrie Hotel` and `lass o'gowrie hotel` should
 * all resolve to the same venue. Lowercase, drop apostrophes/punctuation,
 * expand `&`, and drop a leading or embedded standalone "the".
 */
export function normaliseVenueKey(value?: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[‘’'`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bthe\b/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Mirrors `findKnownAddressAndCoords` (entry name contains the event's venue)
 * but normalises both sides and also accepts the reverse containment, so
 * "Croatian Club" still finds the curated "Croatian" entry.
 */
export function findCuratedVenue(
  venueName?: string,
  locations: VenueLocation[] = VENUE_LOCATIONS,
): VenueLocation | undefined {
  const key = normaliseVenueKey(venueName);
  if (key.length < 3) return undefined;

  return locations.find((location) => {
    const curatedKey = normaliseVenueKey(location.venueName);
    if (curatedKey.length < 3) return false;
    return curatedKey.includes(key) || key.includes(curatedKey);
  });
}

/**
 * "Unknown location" is the strict combination the recheck was asked for:
 * no usable venue name, no coordinates, and no curated entry to fall back on.
 */
export function isUnknownVenue(
  event: AuditEvent,
  locations: VenueLocation[] = VENUE_LOCATIONS,
): boolean {
  const name = (event.venueName ?? "").trim();
  const hasNoName = !name || UNKNOWN_VENUE.test(name);

  return hasNoName && !hasValidLngLat(event.lngLat) && !findCuratedVenue(name, locations);
}

/** A real venue name that is simply not in `venueLocations.json` yet. Report-only. */
export function isUncuratedVenue(
  venueName?: string,
  locations: VenueLocation[] = VENUE_LOCATIONS,
): boolean {
  const name = (venueName ?? "").trim();
  if (!name || UNKNOWN_VENUE.test(name)) return false;

  return !findCuratedVenue(name, locations);
}

export function classifyEvent(
  event: AuditEvent,
  locations: VenueLocation[] = VENUE_LOCATIONS,
): RowFlag[] {
  const flags: RowFlag[] = [];

  if (!event.eventPromoters?.trim()) flags.push("no-promoter");
  if (isUnknownVenue(event, locations)) flags.push("unknown-venue");
  if (event.venueName?.includes(" - ")) flags.push("promoter-in-venue");

  return flags;
}

export type RowStats = {
  rows: number;
  withPromoter: number;
  curatedVenue: number;
  uncuratedVenue: number;
  unknownVenue: number;
  missingCoords: number;
};

export function summariseRows(
  events: AuditEvent[],
  locations: VenueLocation[] = VENUE_LOCATIONS,
): RowStats {
  return events.reduce<RowStats>(
    (stats, event) => {
      stats.rows++;
      if (event.eventPromoters?.trim()) stats.withPromoter++;
      if (findCuratedVenue(event.venueName, locations)) stats.curatedVenue++;
      if (isUncuratedVenue(event.venueName, locations)) stats.uncuratedVenue++;
      if (isUnknownVenue(event, locations)) stats.unknownVenue++;
      if (!hasValidLngLat(event.lngLat)) stats.missingCoords++;
      return stats;
    },
    { rows: 0, withPromoter: 0, curatedVenue: 0, uncuratedVenue: 0, unknownVenue: 0, missingCoords: 0 },
  );
}

// ---------------------------------------------------------------- audit

export type AuditedRow = {
  id?: string;
  eventName?: string;
  venueName?: string;
  eventPromoters?: string;
  bucketKey?: string;
  hasCoords: boolean;
  curatedVenue?: string;
  uncuratedVenue: boolean;
  flags: RowFlag[];
};

export type AuditedImage = {
  filePath: string;
  fileName: string;
  day: DayOfWeek;
  birthtime: string;
  bucketKey: string;
  imagesInBucket: number;
  processed: boolean;
  rowsInBucket: number;
  reasons: ImageFlag[];
  priority: number;
  rows: AuditedRow[];
  before: RowStats;
};

export type AuditResult = {
  images: AuditedImage[];
  unbucketedRows: AuditEvent[];
  processedImageCount: number;
};

function toAuditedRow(event: AuditEvent, locations: VenueLocation[]): AuditedRow {
  return {
    id: event.id,
    eventName: event.eventName,
    venueName: event.venueName,
    eventPromoters: event.eventPromoters,
    bucketKey: eventBucketKey(event.eventDateTime),
    hasCoords: hasValidLngLat(event.lngLat),
    curatedVenue: findCuratedVenue(event.venueName, locations)?.venueName,
    uncuratedVenue: isUncuratedVenue(event.venueName, locations),
    flags: classifyEvent(event, locations),
  };
}

function priorityFor(reasons: ImageFlag[], rowsInBucket: number): number {
  let score = rowsInBucket;

  if (reasons.includes("no-extracted-events")) score += 10_000;
  if (reasons.includes("not-processed")) score += 5_000;
  if (reasons.includes("unknown-venue")) score += 1_000;
  if (reasons.includes("promoter-in-venue")) score += 500;

  return score;
}

export function auditImages(
  images: ImageFile[],
  rows: AuditEvent[],
  processedImages: Set<string>,
  locations: VenueLocation[] = VENUE_LOCATIONS,
): AuditResult {
  const rowsByBucket = new Map<string, AuditEvent[]>();
  const unbucketedRows: AuditEvent[] = [];

  for (const row of rows) {
    const key = eventBucketKey(row.eventDateTime);
    if (!key) {
      unbucketedRows.push(row);
      continue;
    }

    const bucket = rowsByBucket.get(key);
    if (bucket) bucket.push(row);
    else rowsByBucket.set(key, [row]);
  }

  const imagesInBucket = new Map<string, number>();
  for (const image of images) {
    const key = imageBucketKey(image.day, image.birthtime);
    imagesInBucket.set(key, (imagesInBucket.get(key) ?? 0) + 1);
  }

  const audited = images.map<AuditedImage>((image) => {
    const bucketKey = imageBucketKey(image.day, image.birthtime);
    const bucketRows = rowsByBucket.get(bucketKey) ?? [];
    const processed = processedImages.has(image.filePath);
    const auditedRows = bucketRows.map((row) => toAuditedRow(row, locations));

    const reasons = new Set<ImageFlag>();
    for (const row of auditedRows) {
      for (const flag of row.flags) reasons.add(flag);
    }
    if (bucketRows.length === 0) reasons.add("no-extracted-events");
    if (!processed) reasons.add("not-processed");

    const reasonList = [...reasons];

    return {
      filePath: image.filePath,
      fileName: path.basename(image.filePath),
      day: image.day,
      birthtime: image.birthtime.toISOString(),
      bucketKey,
      imagesInBucket: imagesInBucket.get(bucketKey) ?? 1,
      processed,
      rowsInBucket: bucketRows.length,
      reasons: reasonList,
      priority: priorityFor(reasonList, bucketRows.length),
      rows: auditedRows,
      before: summariseRows(bucketRows, locations),
    };
  });

  return { images: audited, unbucketedRows, processedImageCount: processedImages.size };
}

// ---------------------------------------------------------------- corpus

type ResearchCorpus = {
  files: string[];
  events: AuditEvent[];
  processedImages: Set<string>;
};

function loadResearchCorpus(): ResearchCorpus {
  const files = fs
    .readdirSync(researchDataDir)
    .filter((file) => /^events-\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();

  const events = new Map<string, AuditEvent>();
  const processedImages = new Set<string>();

  for (const file of files) {
    const data = readResearchData(file);
    for (const image of data.processedImages) processedImages.add(image);
    data.events.forEach((event, index) => {
      events.set(event.id ?? `${file}#${index}`, event as AuditEvent);
    });
  }

  return { files, events: [...events.values()], processedImages };
}

// ---------------------------------------------------------------- re-extraction

type AfterRow = AuditEvent & { flags: RowFlag[]; curatedVenue?: string };

type RecheckImageResult = {
  attempted: boolean;
  error?: string;
  afterRows?: AfterRow[];
  after?: RowStats;
};

type ReportImage = AuditedImage & { recheck?: RecheckImageResult };

function mimeTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

async function recheckImage(
  image: AuditedImage,
  locations: VenueLocation[],
): Promise<RecheckImageResult> {
  const bytes = fs.readFileSync(image.filePath);
  const imagePart = {
    inlineData: { data: bytes.toString("base64"), mimeType: mimeTypeFor(image.filePath) },
  };

  try {
    const data = await extractEventData(imagePart);

    const afterRows = data.events.map<AfterRow>((rawEvent) => {
      const normalised = { ...rawEvent, ...normalisePromoterAndVenue(rawEvent) } as AuditEvent;
      return {
        ...normalised,
        flags: classifyEvent(normalised, locations),
        curatedVenue: findCuratedVenue(normalised.venueName, locations)?.venueName,
      };
    });

    return {
      attempted: true,
      afterRows,
      after: summariseRows(afterRows, locations),
    };
  } catch (error) {
    return { attempted: true, error: (error as Error).message };
  }
}

// ---------------------------------------------------------------- report

type UncuratedVenueSummary = {
  venueName: string;
  rows: number;
  weeks: number;
};

type RecheckReport = {
  generatedAt: string;
  mode: "dry-run" | "re-extract";
  year: number;
  sourceFiles: string[];
  processedImageCount: number;
  imagesScanned: number;
  imagesFlagged: number;
  imagesAttempted: number;
  rowsAudited: number;
  unbucketedRows: number;
  reasonCounts: Record<string, number>;
  before: RowStats;
  uncuratedVenues: UncuratedVenueSummary[];
  images: ReportImage[];
  errors: { fileName: string; message: string }[];
};

function reasonCounts(images: AuditedImage[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const image of images) {
    for (const reason of image.reasons) counts[reason] = (counts[reason] ?? 0) + 1;
  }

  return counts;
}

function uncuratedVenues(
  rows: AuditEvent[],
  locations: VenueLocation[],
): UncuratedVenueSummary[] {
  const byVenue = new Map<string, { rows: number; weeks: Set<string> }>();

  for (const row of rows) {
    if (!isUncuratedVenue(row.venueName, locations)) continue;

    const name = row.venueName!.trim();
    const entry = byVenue.get(name) ?? { rows: 0, weeks: new Set<string>() };
    entry.rows++;
    entry.weeks.add(eventBucketKey(row.eventDateTime) ?? "unbucketed");
    byVenue.set(name, entry);
  }

  return [...byVenue.entries()]
    .map(([venueName, { rows, weeks }]) => ({ venueName, rows, weeks: weeks.size }))
    .sort((a, b) => b.rows - a.rows || a.venueName.localeCompare(b.venueName));
}

const escapeCell = (value: string) => value.replace(/\|/g, "\\|");

const localDate = (iso: string) =>
  DateTime.fromISO(iso, { setZone: true }).setZone(SYDNEY).toISODate() ?? iso.slice(0, 10);

function recheckMarkdown(report: RecheckReport): string {
  const lines: string[] = [];
  const flagged = report.images.filter((image) => image.reasons.length > 0);
  const rechecked = report.images.filter((image) => image.recheck?.attempted);

  lines.push(`# Image recheck — ${localDate(report.generatedAt)}`, "");
  lines.push(
    report.mode === "dry-run"
      ? "**Mode:** dry run — no model calls were made."
      : "**Mode:** re-extraction.",
    "",
  );

  lines.push("## Summary", "");
  lines.push("| Measure | Value |", "| --- | ---: |");
  lines.push(`| Images scanned | ${report.imagesScanned} |`);
  lines.push(`| Images flagged | ${report.imagesFlagged} |`);
  lines.push(`| Images re-extracted | ${report.imagesAttempted} |`);
  lines.push(`| Rows audited | ${report.rowsAudited} |`);
  lines.push(`| Rows with no promoter | ${report.before.rows - report.before.withPromoter} |`);
  lines.push(`| Rows with an unknown venue | ${report.before.unknownVenue} |`);
  lines.push(`| Rows with no coordinates (context only) | ${report.before.missingCoords} |`);
  lines.push(`| Rows outside any image bucket | ${report.unbucketedRows} |`);
  lines.push(`| Curated rows | ${report.before.curatedVenue} |`);
  lines.push("");

  lines.push("## Why images were flagged", "");
  lines.push("| Reason | Images |", "| --- | ---: |");
  for (const [reason, count] of Object.entries(report.reasonCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`| \`${reason}\` | ${count} |`);
  }
  lines.push("");

  if (rechecked.length > 0) {
    lines.push("## Re-extraction results", "");
    lines.push(
      "Each row below is what the model returned for that image on this run. Buckets shared by several images cannot be attributed row-by-row, so this is not a strict before/after delta.",
      "",
    );
    lines.push("| Image | Extracted rows | With promoter | Curated venue | With coordinates | Unknown venue |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
    for (const image of rechecked) {
      const after = image.recheck!.after;
      lines.push(
        `| ${escapeCell(image.fileName)} | ${after?.rows ?? "—"} | ${after?.withPromoter ?? "—"} | ${
          after?.curatedVenue ?? "—"
        } | ${after ? after.rows - after.missingCoords : "—"} | ${after?.unknownVenue ?? "—"} |`,
      );
    }
    lines.push("");

    const errors = report.errors;
    if (errors.length > 0) {
      lines.push("### Failed images", "");
      for (const error of errors) lines.push(`- \`${error.fileName}\` — ${error.message}`);
      lines.push("");
    }
  }

  lines.push("## Uncurated venues (report only)", "");
  lines.push(
    "These names appear on posters but have no entry in `venueLocations.json`. Adding them there is a manual fix; it does not require another model run.",
    "",
  );
  lines.push("| Venue | Rows | Weeks |", "| --- | ---: | ---: |");
  for (const venue of report.uncuratedVenues) {
    lines.push(`| ${escapeCell(venue.venueName)} | ${venue.rows} | ${venue.weeks} |`);
  }
  lines.push("");

  lines.push("## Flagged images", "");
  lines.push("| # | Image | Saved day | Event week | Rows | Reasons |");
  lines.push("| ---: | --- | --- | --- | ---: | --- |");
  const tableLimit = 200;
  flagged
    .sort((a, b) => b.priority - a.priority || a.fileName.localeCompare(b.fileName))
    .slice(0, tableLimit)
    .forEach((image, index) => {
      lines.push(
        `| ${index + 1} | ${escapeCell(image.fileName)} | ${image.day} | ${formatBucketKey(
          image.bucketKey,
        )}${image.imagesInBucket > 1 ? ` (${image.imagesInBucket} images)` : ""} | ${
          image.rowsInBucket
        } | ${image.reasons.join(", ")} |`,
      );
    });
  if (flagged.length > tableLimit) {
    lines.push("", `_Showing ${tableLimit} of ${flagged.length} flagged images; the JSON report has all of them._`);
  }
  lines.push("");

  lines.push("## How this works", "");
  lines.push(
    "- Rows carry no image path, so images and rows are linked by the `(ISO week, weekday)` of the image's resolved date and the row's `eventDateTime` in Australia/Sydney.",
    "- When several images share a week/weekday (a re-saved poster), the bucket's rows appear against each of them, so the `Rows` column is not additive and can exceed the corpus total.",
    "- `unknown-venue` is the strict combination: no usable venue name, no valid `lngLat`, and no match in `venueLocations.json`.",
    "- Missing coordinates are counted in the summary for context but are **not** a re-extraction trigger.",
    "- `uncurated-venue` is deliberately **not** a re-extraction trigger. It is listed above as an edit for `venueLocations.json`.",
    "- This script never writes `processed-images.json` or the research dumps.",
    "",
  );

  return lines.join("\n");
}

function writeReport(report: RecheckReport): { jsonPath: string; markdownPath: string } {
  const stamp = localDate(report.generatedAt);
  const base = `recheck-images-${stamp}`;
  const jsonPath = path.join(researchDataDir, `${base}.json`);
  const markdownPath = path.join(researchDataDir, `${base}.md`);

  fs.mkdirSync(researchDataDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(markdownPath, recheckMarkdown(report));

  return { jsonPath, markdownPath };
}

// ---------------------------------------------------------------- main

async function main() {
  const argv = minimist(process.argv.slice(2), {
    boolean: ["dry-run"],
    string: ["year"],
    default: { year: String(new Date().getFullYear()) },
  });

  const year = Number(argv.year);
  const dryRun = Boolean(argv["dry-run"]);
  const limit = Number(argv.limit) > 0 ? Number(argv.limit) : undefined;

  if (!Number.isInteger(year)) {
    throw new Error(`Invalid --year: ${argv.year}`);
  }

  console.log(`Rechecking ${year} weekly images${dryRun ? " (dry run)" : ""}${limit ? `, limit ${limit}` : ""}.`);

  const corpus = loadResearchCorpus();
  const images = getWeeklyImagesFromDownloads(year).sort(
    (a, b) => a.birthtime.getTime() - b.birthtime.getTime() || a.filePath.localeCompare(b.filePath),
  );

  console.log(
    `Loaded ${corpus.events.length} rows from ${corpus.files.length} research dump(s); ` +
      `found ${images.length} day-named image(s) saved in ${year}.`,
  );

  const audit = auditImages(images, corpus.events, corpus.processedImages);
  const reportImages: ReportImage[] = audit.images;
  const flagged = reportImages
    .filter((image) => image.reasons.length > 0)
    .sort((a, b) => b.priority - a.priority || a.fileName.localeCompare(b.fileName));

  const before = summariseRows(corpus.events);
  const counts = reasonCounts(reportImages);

  console.log("");
  console.log(`Flagged ${flagged.length} of ${reportImages.length} image(s).`);
  for (const [reason, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason}: ${count} image(s)`);
  }
  console.log(
    `Rows: ${before.rows} total, ${before.rows - before.withPromoter} without a promoter, ` +
      `${before.unknownVenue} unknown venue, ${before.missingCoords} without coordinates, ` +
      `${before.uncuratedVenue} at uncurated venues.`,
  );
  console.log(`Rows outside any image bucket: ${audit.unbucketedRows.length}.`);

  const report: RecheckReport = {
    generatedAt: new Date().toISOString(),
    mode: dryRun ? "dry-run" : "re-extract",
    year,
    sourceFiles: corpus.files,
    processedImageCount: audit.processedImageCount,
    imagesScanned: reportImages.length,
    imagesFlagged: flagged.length,
    imagesAttempted: 0,
    rowsAudited: before.rows,
    unbucketedRows: audit.unbucketedRows.length,
    reasonCounts: counts,
    before,
    uncuratedVenues: uncuratedVenues(corpus.events, VENUE_LOCATIONS),
    images: reportImages,
    errors: [],
  };

  if (!dryRun) {
    const selected = limit ? flagged.slice(0, limit) : flagged;
    console.log("");
    console.log(`Re-extracting ${selected.length} image(s) with the vision model.`);

    for (const [index, image] of selected.entries()) {
      console.log(`[${index + 1}/${selected.length}] ${image.fileName}`);

      const result = await recheckImage(image, VENUE_LOCATIONS);
      image.recheck = result;
      report.imagesAttempted++;

      if (result.error) {
        report.errors.push({ fileName: image.fileName, message: result.error });
        console.error(`  failed: ${result.error}`);
      } else if (result.after) {
        console.log(
          `  extracted ${result.after.rows} row(s): ` +
            `${result.after.withPromoter} with a promoter, ` +
            `${result.after.curatedVenue} at a curated venue, ` +
            `${result.after.rows - result.after.missingCoords} with coordinates`,
        );
      }

      const paths = writeReport(report);
      if (index === selected.length - 1) {
        console.log(`Report written to ${paths.jsonPath} and ${paths.markdownPath}`);
      }
    }

    writeReport(report);
  }

  if (dryRun) {
    const paths = writeReport(report);
    console.log(`Report written to ${paths.jsonPath} and ${paths.markdownPath}`);
  }

  console.log("Done. No research state was modified.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
