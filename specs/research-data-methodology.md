# How I worked out what `researchData` can actually tell us

Date: 2026-10-23
Input: `researchData/events-2026-10-17.json`, `researchData/processed-images.json`
Deliverable: this document. No charts, no image assets, no code changes.

> **Revised numbers:** `specs/research-data-analysis.md` supersedes several raw-row estimates
> below (listings, recurring series, one-off rate). See its "Corrections to earlier raw-row
> estimates" section before quoting anything from this document.

> **Update 2026-10-23 — fields removed.** `lngLat` (1,693 rows) and `venueAddress` (all 1,743 rows,
> since every row has a `venueName`) have since been deleted from `events-2026-10-17.json`. The
> coordinate findings below describe the data as analysed, and are the reason those fields were
> dropped. Note that `src/helpers/getImageResearchData.ts` will reintroduce both fields on the next
> `npm run research` unless the extraction schema or the writer is changed.

The question was "how do we get informative data and infographics out of this dump".
This is the investigation behind that answer: what the file contains, what it can be trusted for,
what it cannot, and which numbers are safe to publish.

---

## Step 1 — Locate the data and its producer

`researchData/` holds two files. I read the producer code before reading the data, because a JSON
dump tells you the values but not the semantics.

```bash
find . -iname "*research*" -not -path "*/node_modules/*"
# researchData/
# src/helpers/getImageResearchData.ts
# src/helpers/getImageResearchData.test.ts
```

Then the relevant code:

| File | Why it matters |
| --- | --- |
| `src/helpers/getImageResearchData.ts` | writes the dump; defines what each field means |
| `src/helpers/writeToFiles.ts` | `ResearchData` shape, file naming, where output goes |
| `src/helpers/extractEventsFromImages.ts` | the prompt/schema the model is given |
| `src/apis/geminiAiApi.ts` | model, schema enforcement, tool use |
| `src/helpers/findKnownAddressAndCoords.ts` + `venueLocations.json` | what the *production* pipeline does differently |
| `scripts/weekly-pipeline.sh` | where this data would fit in a recurring run |

That reading produced three findings no amount of profiling would have given me.

### 1a. There are two extraction paths, and this dump is the unvalidated one

- `npm run images` → `extractEventsFromImages.ts` → passes every result through
  `findKnownAddressAndCoords()` (a curated `venueLocations.json`) and
  `enrichEventFromGooglePlaces()` before writing `complete-events.json`.
- `npm run research` → `getImageResearchData.ts` → writes the model's output **straight through**.
  No venue lookup, no address validation, no geocoding.

`researchData` is therefore a raw poster corpus. It is not a location dataset, and it is not
the same shape as production events.

### 1b. `eventDateTime` is overwritten

```ts
completeEvents.push({
  ...imgEvent,                 // includes the date the model read off the poster
  eventDateTime,               // ...then replaced:
});
```

`eventDateTime` comes from `getImageEventDateTime(day, birthtime)` — the weekday in the **filename**
(`friday(23).png`), anchored to the ISO week of the file's macOS "Date Added". Two consequences:
every event from one image shares one timestamp, and the model's own extracted date is discarded.

### 1c. The model is asked to invent addresses and coordinates

From `eventsExtractionPrompt`:

> "Missing Data: The image lists venue names but not their addresses or coordinates. You must use
> your internal knowledge to identify the correct venue in Newcastle, NSW, and provide the address
> and [Longitude, Latitude]."

With `googleSearch` enabled and no post-validation. I flagged this as a likely source of noise
and came back to it in Step 7 — it turned out to be the biggest data-quality problem in the file.

---

## Step 2 — Structural profile

I used throwaway Python (stdlib only) rather than adding tooling, since the repo has no analysis
layer. Example of the shape check:

```python
d = json.load(open('researchData/events-2026-10-17.json'))
# keys: ['processedImages', 'events']  -> 245 images, 1743 events
```

**Schema.** Every row has the same 12 keys (`eventName`, `venueName`, `venueAddress`, `genres`,
`lngLat`, `ticketCost`, plus `id`, `userName`, `userEmail`, `localTimeZone`, `eventDateTime`,
`source`). All `source` values are `"whList"`. `userName`/`userEmail` are constant.

**Coverage.**

| Field | Present | Missing/blank |
| --- | --- | --- |
| `eventName`, `venueName`, `venueAddress`, `genres` (key) | 1743 | 0 |
| `genres` (value) | 1732 | 11 |
| `ticketCost` (key) | 1722 | 21 |
| `ticketCost` (usable) | 1558 | 185 |
| `lngLat` | 1693 | 50 |

So the mandatory fields are complete; the optional ones are the problem.

---

## Step 3 — Establish the time semantics (this changed the numbers)

My first pass grouped on the raw date string and produced:

`Fri 567 · Thu 467 · Sat 365 · Wed 213 · Tue 131`

That is wrong as a description of the poster week, because the timestamps are UTC and the run
writes **02:00 Sydney**. Converting to `Australia/Sydney` first:

```python
datetime.fromisoformat(x.replace('Z','+00:00')).astimezone(ZoneInfo('Australia/Sydney'))
```

gives:

`Sat 567 · Fri 467 · Sun 365 · Thu 213 · Wed 131`

which matches the filenames, which are only ever `wednesday … sunday`. Example:

```
2026-01-08T15:00:00Z  ->  2026-01-09 02:00 Sydney (Friday)  ->  filename friday(...)
```

Two of my earlier statements were artefacts of that UTC/Local confusion, now corrected:

| Earlier | Correct |
| --- | --- |
| "Friday is the busiest night (567)" | Saturday is (567); Friday is 467 |
| "June has 8 events" | June has **0**; those 8 rows are 1 July posters in local time |

I also checked the 171 distinct timestamps: 1,726 events sit at exactly 02:00 local, 17 at 03:00
(around the April DST change). This confirms the timestamp is synthetic, not read from posters.

**Poster-day sizes** (one day's posters = one date bucket):

min 2 · median 8 · p90 19 · max 58
Largest: 2026-09-19 (58), 2026-05-23 (46), 2026-08-28 (36), 2026-09-18 (34), 2026-07-03 (30).

**Weekly coverage.** 35 of the 43 ISO weeks of 2026 have data. Missing:

```
W01 (before first capture), W18, W23, W24, W25, W26 (1–28 Jun), W39, W43 (current week)
```

Monthly, in local time: Jan 174 · Feb 202 · Mar 175 · Apr 162 · May 208 · **Jun 0** · Jul 214 ·
Aug 224 · Sep 228 · Oct 156.

So the "quiet June" is a capture gap, not a scene collapse. W38 is the opposite artefact: 145 events,
roughly 2.5× a normal week, from a catch-up batch.

---

## Step 4 — Entity normalisation, measured before trusting counts

### Venues

140 raw strings. Applying a naive normaliser (lowercase, apostrophe folding, drop leading `The`
and trailing `Hotel|Bar|Rooftop|Club`, strip punctuation) collapses them to **115 groups**.
The worst offender is one venue under seven spellings:

```
Lass O'Gowrie · The Lass O'Gowrie · Lass O'Gowrie Hotel · The Lass O'Gowrie Hotel
Lass O’Gowrie · Lass O’Gowrie Hotel · The Lass O’Gowrie   (7)
```

Others: Beauford (3), Theydy's (3), Seven Seas (3), Croatian Club (2), Stag & Hunter (2).
A hand-curated `venueAliases.json` is unavoidable — the regex gets close but produces false merges
(`The Ori` and `Ori Hotel` are the same; `Hamilton Station` and `Hamilton Station Hotel` are, but
`King Street Hotel` and `King Street` need a human).

### Genres

280 raw comma-separated strings collapse to **58 atoms** once split and upper-cased. Top atoms:

| Atom | Count |
| --- | --- |
| FREE | 509 |
| ROCK | 336 |
| DANCE | 267 |
| VINYL | 183 |
| JAZZ | 182 |
| INDIE | 180 |
| PUNK | 154 |
| ACOUSTIC | 139 |
| LGBTQI+ | 109 |
| ALT | 90 |

`FREE` is a price signal sitting in the genre field — it would dominate any genre breakdown and make
the scene look like one thing. It has to be extracted as a flag before counting genres.
Also: `LGBTQI+` / `LGBTQIA+` / `LGBTQ+` are the same tag under three spellings, and `PSYC` is a
truncation of `PSYCH`.

### Artists

1,705 distinct strings, of which **792 appear exactly once** — so the long tail is real, but it is a
long tail of *strings*, not verified artists (no IDs, no fuzzy matching). Billing depth from the
comma split:

| Acts on the bill | Events |
| --- | --- |
| 1 | 891 |
| 2 | 222 |
| 3 | 295 |
| 4 | 140 |
| 5 | 73 |
| 6 | 38 |
| 7–10 | 69 |
| 11–21 | 15 |

One event names 21 acts, which is almost certainly a festival lineup crammed onto one listing.

### Price

1,558 parse cleanly. Of those, **1,100 are free** and 458 paid (median **$25**, mean $31.49,
range $5–$123.95). The other **185 rows are unusable**:

| Raw value | Rows |
| --- | --- |
| `"undefined"` | 140 |
| field absent | 21 |
| `""` | 8 |
| `"N/A"` | 6 |
| `"Unknown"` | 4 |
| `"0.00, FREE"` | 3 |
| `"null"` / `"unknown"` / `"0.00,00.00"` | 3 |

Critically, `"undefined"` is a *string*, not null — any `parseFloat`-style pipeline turns it into
`NaN` or, worse, into `0` and silently invents free events.

---

## Step 5 — Test the dedupe keys instead of assuming one

I tried four candidate identities and measured how much each collapses:

| Key | Unique rows | Rows removed |
| --- | --- | --- |
| `(name, venue, UTC date)` | 1,241 | 502 |
| `(name, venue, Sydney date)` | 1,241 | 502 |
| `(name, venue, ISO week)` | 1,239 | **504** (402 groups) |
| `(name, venue)` — any week | 950 | 793 (365 groups) |

The last row is the trap: 365 groups recur across weeks, and they are **not duplicates** —
`BYO Vinyl Night` at Maru Hi-Fi appears 42 times, `Open Decks` 37, `Lvl 1 District Saturdays` 27,
`Wharf Life` 26, `Jazz Night` 25, `Sunday Club` 24. These are weekly residencies. Collapsing them
would delete the most stable part of the scene.

So the defensible unit is **(act, venue, ISO week)** → ~1,239 listings. But any published headline
must state its unit, because the same corpus yields 1,743 / 1,239 / 950 depending on the definition.

---

## Step 6 — Autopsy the duplicates

I expected byte-identical copies. There are **zero** identical rows. So I dumped one group in full:

`DJ Secateurs @ The Oak`, week 21 — five rows, same name, same venue, same week, and:

```
207 Maitland Rd, Tighes Hill NSW 2297   lngLat [151.7288, -32.9099]
247 Maitland Rd, Islington NSW 2296     lngLat [151.7285, -32.9096]
207 Maitland Road, Tighes Hill NSW 2297 lngLat [151.7408, -32.9003]
197 George St, The Junction NSW 2291    lngLat [151.7640, -32.9320]
207 Maitland Road, Tighes Hill NSW 2297 lngLat [151.7275, -32.9095]
```

The duplicates are real: the same event listed on several posters, each extraction hallucinating a
different address for the same venue name. One of those addresses is 4 km away in a different suburb.

### How bad is it, corpus-wide

| Venue | Rows | Distinct coords | Distinct addresses | Max spread |
| --- | --- | --- | --- | --- |
| The Oak | 140 | 132 | 44 | **14.11 km** |
| Hiss & Crackle | 14 | 13 | 9 | 8.57 km |
| The Underground | 48 | 39 | 19 | 8.22 km |
| Ori Hotel | 40 | 39 | 10 | 7.24 km |
| Croatian Club | 43 | 42 | 16 | 5.57 km |
| Gallipoli House | 41 | 35 | 24 | 4.88 km |
| Bernies Bar | 109 | 99 | 25 | 4.38 km |
| Hamilton Station Hotel | 202 | 127 | 15 | 3.39 km |
| Maru Hi-Fi | 175 | 141 | 46 | 3.52 km |

**80 of 140 venue names have more than one coordinate.** There is also a venue literally called
`Unknown` with 7 rows and 4 coordinates spanning 15,311 km.

This is consistent with Step 1c: the research prompt asks the model for coordinates from "internal
knowledge" with no verification. The production path avoids it by looking up
`venueLocations.json` — which currently has only **19 entries**, so it would cover the top venues but
not the long tail.

Genres disagree inside dedupe groups too: **130 of 1,239 groups** have conflicting genre strings
(e.g. `VINYL, FREE` vs `VINYL`), so a merge rule is needed (union, or richest row wins), not just
"keep first".

---

## Step 7 — Check coverage against the source images

`processedImages` holds absolute paths under `~/Downloads`. I compared basenames against what is
actually on disk:

| Measure | Count |
| --- | --- |
| Weekday-named images on disk | 451 |
| Dated 2026 | 251 |
| Recorded as processed | 245 (all still on disk) |
| 2026 images not yet processed | **6** |

The 6 pending are this week's drop: `wednesday(71)`, `thursday(75)`, `thursday(76)`,
`friday(97)`, `saturday(109)`, `sunday(93)`, saved 21–22 Oct. That is why W43 is "missing" in Step 3.

Processed 2026 images by save month: Jan 28 · Feb 28 · Mar 24 · Apr 28 · May 30 · **Jun 0** ·
Jul 32 · Aug 27 · Sep 34 · Oct 14.

June has zero source images, which independently confirms the gap is a capture gap and not an
extraction failure. The other 200 images on disk are from 2025 and are correctly excluded.

Note: the absolute paths in `processed-images.json` are machine-specific and should not be treated
as portable data.

---

## Step 8 — Decide what is informative

Given the above, the corpus supports different claims with different levels of confidence.

**Safe to publish (after normalisation):**

- Volume by poster week and weekday — but framed as *what is being advertised*, not what is on.
- Venue popularity and concentration, once the 7-variant aliases are merged (~1% of rows shift).
- Genre atom mix, after `FREE` is lifted out and `LGBTQIA+` variants are merged.
- Free vs paid split and the paid price distribution — median $25, but state the 185 unknowns.
- Billing depth (891 single-act listings vs 15 mega-bills).
- Residency recurrence — 365 series, the most stable signal in the file.

**Not safe without extra work:**

- Any map, distance, or neighbourhood claim — 80 of 140 venue names have conflicting coordinates.
- Any event-date-specific claim — the date is the poster's save week.
- Month-over-month trends — five weeks are missing and one is a 2.5× catch-up artefact.
- "Unique events" as a bare number — it is 1,743 / 1,239 / 950 depending on the dedupe unit.
- Venue addresses as published facts — 44 different addresses exist for The Oak alone.
- Artist-level "top acts" — 1,705 unverified strings with no identity resolution.

**The single number to fix before anything else:** dedupe plus venue canonicalisation. Until then
every count is somewhere between 29% and 45% inflated, and every geographic claim is fiction.

---

## Limitations of this analysis

- I did not verify extraction accuracy against the source posters — only internal consistency of
  the output.
- The venue grouping in Step 4 is a heuristic regex, not the final alias map; 115 is an estimate.
- `birthtime` was trusted as the "date added" anchor per the code comment; it was not independently
  validated.
- Missing weeks are inferred from absence of data and absence of source images. I did not check
  whether the images existed and were deleted.
- The 15,311 km "Unknown" venue spread is almost certainly bad geocoding rather than a real place,
  but I did not inspect those rows individually.
- Price parsing treated only `^\d+(\.\d+)?$` as numeric; `"0.00, FREE"` was counted as unusable,
  which is conservative.

---

## Summary

1. **The file is 1,743 raw listing rows from 245 poster screenshots**, extracted by Gemini with no
   validation. All rows share the same 12-key schema; mandatory fields are complete.
2. **`eventDateTime` is synthetic.** It is the filename's weekday inside the screenshot's save week,
   and it overwrites the date the model read off the poster. Every event from one image shares one
   timestamp, and the timestamps are UTC while the intent is Sydney — which shifts every weekday
   back by one day if you group naively. Correct local distribution: Sat 567 · Fri 467 · Sun 365 ·
   Thu 213 · Wed 131.
3. **The corpus is smaller than it looks and bigger than it seems.** 1,743 rows → 1,239 listings
   after same-week dedupe → 950 distinct act+venue pairs. 365 of those pairs recur across weeks and
   must not be deduped; they are residencies.
4. **Duplicates are not copies.** There are zero identical rows; 402 groups share act+venue+week but
   disagree on address and coordinates because the model invents both. The Oak alone has 44 addresses
   and 132 coordinate pairs spanning 14 km; 80 of 140 venues have multiple coordinates.
5. **Field-level dirt is concentrated and countable.** 185 unusable ticket prices (140 are the string
   `"undefined"`), 50 missing coordinates, 11 missing genre values, 280 raw genre strings collapsing
   to 58 atoms with `FREE` appearing 509 times as if it were a genre.
6. **The weekday distribution is stable and usable.** Saturday and Friday carry 1,034 of 1,743
   listings; Wednesday is the thinnest night at 131.
7. **The gaps are in the capture, not the model.** June 2026 has zero events and zero source images;
   four consecutive weeks (W23–W26) plus W18 and W39 are missing, W38 is a 145-event catch-up
   artefact, and this week's six images are simply not processed yet.
8. **Verdict:** the dump is a good *editorial* corpus — volume, venues, genres, price, residencies —
   and a bad *geographic* one. It becomes genuinely informative only after three cheap fixes:
   deterministic dedupe at (act, venue, ISO week), a curated venue-alias map, and replacing the
   model-invented coordinates with `venueLocations.json` lookups (currently 19 entries).
