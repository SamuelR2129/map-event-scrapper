# Rechecking the weekly event images

Status: implemented. Full 266-image re-extraction complete on 2026-11-14, and its promoter /
unknown-venue findings applied to the research corpus. The applier's output was merged into
`researchData/events.json` and the per-date dumps were then removed on 2026-11-14.

The research run (`npm run research`) extracts each poster once and never revisits it. That leaves two
persistent gaps in `researchData/events-*.json`:

- rows with no `eventPromoters`, and
- rows whose venue could not be resolved.

This script audits the stored corpus, flags the images behind those gaps, and (unless `--dry-run`)
re-extracts only the flagged images with the vision model. The audit/recheck step is read-only with
respect to the pipeline: it never writes `processed-images.json` or the `events-*.json` dumps. Its only
outputs are `researchData/recheck-images-<date>.json` and `.md`. A separate applier
(`src/helpers/applyRecheckResults.ts`) folds those findings into a research dump; see
[Applying the findings](#applying-the-findings).

## Files

| File | Purpose |
| --- | --- |
| `src/helpers/recheckWeeklyImages.ts` | Audit, optional re-extraction, JSON + Markdown report |
| `src/helpers/recheckWeeklyImages.test.ts` | 16 unit tests for the pure helpers |
| `src/helpers/applyRecheckResults.ts` | Applies a report's `afterRows` to a research dump (no model calls) |
| `src/helpers/applyRecheckResults.test.ts` | 16 unit tests for matching, promoter merging and row building |
| `package.json` | `"recheck"` and `"apply-recheck"` scripts |
| `src/helpers/getImageResearchData.ts` | Exports `getWeeklyImagesFromDownloads`, `getImageEventDateTime`, `ImageFile`, `DayOfWeek` so both scripts share one Downloads scan |
| `researchData/events.json` | The merged, de-duplicated event corpus (source of truth) |
| `researchData/processed-images.json` | Pipeline state: the 266 images already processed |
| `researchData/recheck-images-<date>.json` / `.md` | Generated per recheck run, then folded into `events.json`; not kept afterwards |

## Usage

```bash
npm run recheck -- --dry-run          # audit only, no model calls
npm run recheck -- --limit 16         # re-extract the 16 highest-priority images
npm run recheck -- --limit 50         # first 50 by priority
npm run recheck                        # all flagged images
npm run recheck -- --year 2025        # scan a different Downloads batch

npm run apply-recheck -- --dry-run    # preview what would be written
npm run apply-recheck                 # apply the latest report to today's dump
npm run apply-recheck -- --report researchData/recheck-images-<date>.json
npm run apply-recheck -- --out 2026-11-14
```

| Flag | Meaning |
| --- | --- |
| `--dry-run` | Audit and report only. No Gemini calls. |
| `--limit N` | Re-extract at most N flagged images, highest priority first. |
| `--year YYYY` | Which `birthtime` year of Downloads images to scan. Defaults to the current year. |
| `--report <path>` | Applier only: which `recheck-images-*.json` to read. Defaults to the newest. |
| `--out YYYY-MM-DD` | Applier only: dump date to write. Defaults to today. |

## How images are linked to rows

Research rows carry no image path, so the script links them by **bucket**: the `(ISO week, weekday)`
pair of the image's resolved event date must match the same pair for the row's `eventDateTime` in
`Australia/Sydney`.

- Image date: `getImageEventDateTime(day, birthtime)` — the weekday named in the filename, resolved
  inside the ISO week the file was saved.
- Row date: `eventDateTime` converted to `Australia/Sydney`.
- Bucket key shape: `2026-W46-3` (ISO year, week, weekday).

If several images share a bucket (a re-saved or updated poster), they share the same rows. The report
shows an `(N images)` marker and warns that the `Rows` column is not additive.

## Flags

| Flag | Trigger | Re-extracts? |
| --- | --- | --- |
| `no-promoter` | `eventPromoters` is blank | Yes |
| `unknown-venue` | No usable venue name **and** no valid `lngLat` **and** no match in `venueLocations.json` | Yes |
| `promoter-in-venue` | A `" - "` survived inside `venueName` | Yes |
| `no-extracted-events` | The image's bucket produced zero rows | Yes |
| `not-processed` | The image is not in `processed-images.json` | Yes |
| `missing-coords` | No valid `[longitude, latitude]` | **No — context only** |
| `uncurated-venue` | A real venue name with no `venueLocations.json` entry | **No — report only** |

`missing-coords` and `uncurated-venue` are deliberately not re-extraction triggers. Coordinates are
counted in the summary for context; uncurated venues are listed as an edit list for
`venueLocations.json`.

### Venue matching

`findCuratedVenue` mirrors `findKnownAddressAndCoords` (the curated entry's name contains the event's
venue) but normalises both sides first:

- lowercase,
- strip apostrophes and punctuation,
- expand `&` to `and`,
- drop a standalone `the`,
- collapse whitespace.

It also accepts the reverse containment, so `Croatian Club` still matches the curated `Croatian` entry.
A venue key shorter than 3 characters never matches.

## Priority order

`--limit` takes images in this order:

1. `no-extracted-events` (+10,000)
2. `not-processed` (+5,000)
3. `unknown-venue` (+1,000)
4. `promoter-in-venue` (+500)
5. then by number of rows in the bucket

This puts the 16 posters from the lost W43–W45 batch first.

## Dry-run result — 2026-11-13

```
Loaded 1778 rows from 3 research dump(s); found 266 day-named image(s) saved in 2026.

Flagged 266 of 266 image(s).
  no-promoter: 250 image(s)
  promoter-in-venue: 38 image(s)
  no-extracted-events: 16 image(s)
  unknown-venue: 8 image(s)
Rows: 1778 total, 1774 without a promoter, 7 unknown venue,
      1753 without coordinates, 263 at uncurated venues.
Rows outside any image bucket: 0.
```

| Measure | Value |
| --- | ---: |
| Images scanned | 266 |
| Images flagged | 266 |
| Images re-extracted | 0 |
| Rows audited | 1,778 |
| Rows with no promoter | 1,774 |
| Rows with an unknown venue | 7 |
| Rows with no coordinates (context only) | 1,753 |
| Rows at uncurated venues | 263 |
| Rows outside any image bucket | 0 |
| Rows already at a curated venue | 1,507 |

### Why everything is flagged

99.8% of rows have no promoter, so 250 of the 266 images contain at least one promoter-less row. The
remaining 16 are the W43–W45 batch that was marked processed but produced zero events. “Re-extract only
flagged images” is therefore effectively a full pass — use `--limit` to stage it.

## Uncurated venues (report only)

82 distinct venue names, covering 263 rows, have no entry in `venueLocations.json`. Adding them there
is a manual fix and does not require a model run. Top 15 by row count:

| Venue | Rows | Weeks |
| --- | ---: | ---: |
| Gallipoli House | 42 | 25 |
| Charlies Rooftop | 33 | 22 |
| Theydy's | 18 | 14 |
| Hiss & Crackle | 14 | 8 |
| Mad Poet | 9 | 7 |
| Bar Romeo | 8 | 6 |
| Maitland Showground | 7 | 2 |
| The Beaches | 7 | 5 |
| Earp Distillery | 5 | 4 |
| Newcastle East Baths | 5 | 2 |
| Ode | 5 | 3 |
| Civic Theatre | 4 | 4 |
| Hamo | 4 | 2 |
| Croation Club Wickham | 3 | 1 |
| The Bennett Hotel | 3 | 2 |

The generated Markdown report has the full table.

## Applying the findings

`npm run apply-recheck` reads the newest `recheck-images-*.json` and writes
`researchData/events-<date>.json`. It never calls the model again and never edits the older dumps.

**What is selected.** Any `afterRows` entry with a non-blank `eventPromoters`, or flagged
`unknown-venue`. Rows whose venue is literally `Unknown` are kept as-is so the promoter survives.

**How rows are matched.** For each finding, the applier looks at the stored rows in the same bucket:

1. same normalised venue and same event name;
2. otherwise same venue and event-name similarity ≥ 0.90;
3. otherwise the event name occurs only once in the bucket.

Venue comparison ignores case, punctuation, a leading `the`, `&` vs `and`, and common street
abbreviations (`St`/`Street`, `Rd`/`Road`, …), and accepts containment, so `King Street` matches
`King Street Hotel`.

**Ids.** A match reuses the stored `id`, so merging the dumps by id
(`scripts/merge-research-data.py`) supersedes the older row instead of adding a duplicate. If the same
event is stored several times with different ids, only one copy is enriched — the merge then collapses
the copies by content (`eventDateTime` + event name + venue), keeping the richest. Unmatched findings get
a new `id` derived from the finding key and date, so re-running the applier does not add the event again.

**Dates.** `eventDateTime` is assigned exactly as the production research run does:
`getImageEventDateTime(image.day, birthtime)` — one timestamp per image.

**Disagreements.** When two saved copies of a poster return different promoter strings, the parts are
unioned (`Kree-8, Witchhouse` + `Kree-8` → `Kree-8, Witchhouse`) and the source values are printed for
review. Audit-only fields (`flags`, `curatedVenue`) are stripped.

Result on the 2026-11-14 report:

| Measure | Value |
| --- | ---: |
| Re-extracted rows | 1,859 |
| Rows with a promoter | 221 |
| Distinct findings (bucket + venue + event) | 166 |
| Existing events enriched (by id) | 129 |
| New events | 34 |
| Events in `events-2026-11-14.json` | 163 |
| Rows still at an `Unknown` venue | 3 |
| Events whose promoters disagreed | 2 (4 stored rows) |

The 3 images that failed extraction (`sunday(56)`, `sunday(69)`, `friday(61)`) contributed nothing.
Merging all four dumps into `researchData/events.json` — by id, by date + event, by venue cluster, then
by near-identical name on the same night and venue — gives **1,245 events**, of which **161** now
carry a promoter (up from 4). The per-date dumps were then removed; `researchData/events.json` is the
single event file. Running the applier twice is idempotent: matched rows keep the corpus id and new
rows derive a stable id from the finding. `scripts/dedupe-events.py` re-checks the merged file for
duplicate `eventName` + `eventDateTime` rows (venue-aware by default; `--strict` ignores venue).

## Caveats

- **The bucket is an approximation.** Rows have no image foreign key, and 58 buckets are shared by
  more than one image (75 extra images overall). The report attributes a bucket's rows to every image
  in it, so per-image `Rows` can exceed the corpus total and must not be summed.
- **Findings are matched, not forced.** 34 findings had no stored row in their bucket and became new
  events. Some are near-duplicates caused by venue/event spelling drift, so review the new ids before
  publishing.
- **`unknown-venue` still requires missing coordinates.** That condition defines an unknown location;
  it does not mean coordinates are a recheck trigger.
- **The 3 pre-existing failures** in `src/helpers/australianDateTimeMapper.test.ts` are unrelated: the
  mapper returns 02:00 Sydney, while the test still expects midnight.

## Tests

```bash
npx tsc --noEmit
npm run test:unit
```

The new suite covers bucket keys (including the UTC/Sydney boundary), the unknown-venue combination,
curated-venue matching and normalisation, flag classification, and row statistics. All 16 pass. The
applier suite adds 16 tests for matching keys, venue drift, duplicate collapsing, promoter merging, id
reuse, stable new ids and audit-field stripping.

## Next steps

1. Review the 34 new ids folded into `researchData/events.json` for near-duplicates before publishing.
2. Resolve the two disagreeing-promoter events (`Kree-8, Witchhouse` and `Thanks For Coming` /
   `Kova Events`) against the original posters.
3. Add the high-volume uncurated venues to `venueLocations.json` (no model calls needed).
4. Re-run `npm run recheck -- --year 2025` for older Downloads images if that batch matters.
