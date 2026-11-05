# Eventbrite eventDateTime + multi-date skip fix plan

## Application Overview

Update plan (NOT a rewrite) for src/scrappers/eventbrite.spec.ts in map-event-scrapper. 22 rows in src/eventFiles/newcastle/incomplete-events.json have source 'eventbrite' and no eventDateTime. Root cause verified live on 5 Nov 2026: (a) the legacy selector [class*="date-info__full-datetime"] no longer exists (0 matches on all 6 sample URLs); (b) [data-testid="event-datetime"] now holds either 'Multiple dates' or a NBSP+bullet (U+00A0/U+2022) string like 'Saturday, September 12  •  9 PM - 3 AM', so the scraper's split(' · ') never splits and parseDate receives a string it cannot parse; (c) every Luxon 'ha'/'h:mma' strategy in src/helpers/parseDates.ts is dead because Luxon needs 'h a'/'h:mm a' when the input has a space before AM/PM. Fix = read Eventbrite's server-rendered __NEXT_DATA__ (props.pageProps.context.basicInfo.startDate = {timezone, local, utc}) as the PRIMARY date source, skip any event that lists multiple dates/sessions (structured flags isSeries/isParentEvent, plus a >24h span rule for multi-day ranges, plus DOM/JSON-LD corroboration), and replace the dead #event-description selector with context.structuredContent.modules[].text (fallback [data-testid="section-wrapper-overview"]). Verified on all 6 failing URLs: 5 are genuine multi-date series and must be skipped (Battle of the Bands, Games Night, Homemade Saturdays, Glasshouse x Sunday Sweats, The Ten Virgins); Mansions x THE AFTERS is a single midnight-crossing session (21:00-03:00) and must be kept with startDate 2026-09-12T11:00:00Z. All key selectors/paths below were checked live; exact-match strings and JSON paths supersede the existing code.

## Test Scenarios

### 1. Eventbrite eventDateTime fix

**Seed:** ``

#### 1.1. Verified findings: selectors, structured sources, formats

**File:** `specs/eventbrite-datetime-scraping-plan.md`

**Steps:**
  1. Count legacy vs current date nodes on all 6 failing URLs
    - expect: [class*="date-info__full-datetime"] and [class*="date-info"] match 0 elements on ALL 6 URLs - the legacy branch is dead code
    - expect: [data-testid="event-datetime"] matches exactly 1 element on all 6, present at document.readyState 'complete' immediately after goto
    - expect: Text on 5 of 6 is exactly 'Multiple dates'; Mansions text is 'Saturday, September 12  •  9 PM - 3 AM' where separators are U+00A0 (NBSP) around U+2022 (bullet), NOT ' · ' (U+00B7)
    - expect: split(' · ') therefore never splits this layout; split(' - ') yields 'Saturday, September 12  •  9 PM' which parseDate cannot parse
  2. Inspect Eventbrite's server-rendered Next.js payload
    - expect: document.getElementById('__NEXT_DATA__') exists on every event page and is in raw curl HTML (187 KB, no JS) - available at domcontentloaded, unaffected by hydration/lazy render/consent
    - expect: Date path: props.pageProps.context.basicInfo.startDate = { timezone: 'Australia/Sydney', local: '2026-09-12T21:00:00', utc: '2026-09-12T11:00:00Z' }
    - expect: End path: props.pageProps.context.basicInfo.endDate = same shape, e.g. { local: '2026-09-13T03:00:00', utc: '2026-09-12T17:00:00Z' } for the midnight-crossing Mansions event
    - expect: Multi-date flags: props.pageProps.context.basicInfo.isSeries and .isParentEvent are true on all 5 'Multiple dates' pages, false on Mansions, Great Gatsby, Barrington and Watchfest
    - expect: Other paths: .status ('live'|'started'|'completed'), .hideStartDate, .hideEndDate, .isTimedEntry, context.goodToKnow.highlights.nextAvailableSession ('2026-11-07T14:00:00+11' on series, null on single-date Mansions), context.salesStatus.salesStatus ('sales_ended')
    - expect: WARNING: pageProps.messages always contains the literal string 'Multiple dates' (i18n table) on every page including single-date ones - never scan body.innerText or raw HTML for detection
  3. Check JSON-LD as a secondary source
    - expect: Event JSON-LD present on Ten Virgins, Games Night, Great Gatsby; ABSENT on Mansions, Homemade Saturdays, Glasshouse -> fallback only
    - expect: When present startDate is offset-correct, e.g. '2026-11-07T14:00:00+11:00' / endDate '2026-11-07T21:00:00+11:00'
    - expect: On a series, JSON-LD startDate is only the FIRST session (Ten Virgins 2026-11-07) - using it without isSeries would publish a wrong single date
    - expect: Event.eventSchedule was null on every sampled page; no <time datetime> element exists on the date node
  4. Compare displayed formats against src/helpers/parseDates.ts
    - expect: Observed: 'Saturday, November 7  •  7 PM - 10 PM', 'Saturday, September 12  •  9 PM - 3 AM', 'Thursday, November 5-Saturday, November 7  •  5 PM-9 PM', 'Multiple dates', 'Nov 5-7'
    - expect: Verified with node+luxon 3.6.1: DateTime.fromFormat('Saturday, November 7 7 PM','cccc, MMMM d ha') is INVALID ('unparsable'); 'h:mma' also fails on '7:00 PM'. Only 'h a' and 'h:mm a' (literal space) parse
    - expect: => every strategy using 'ha' or 'h:mma' (lines 18-32 and 41) can never match an input with a space before AM/PM
    - expect: => the NBSP must be normalised before the bullet is stripped, otherwise Luxon sees 'November 7\u00A0\u2022\u00A07 PM'
    - expect: Strategies without { zone } (lines 18-39) use the machine timezone -> 10-11h drift on a UTC CI box
    - expect: A yearless parse ('cccc, MMMM d h a') defaults to the current year (2026), turning a Jan-2027 event into a past 2026 date
  5. Check the description selector
    - expect: #event-description matches 0 elements on all 6 URLs and every other sampled page, including Great Gatsby which visibly has a long description - this is why eventDescription is empty
    - expect: DOM replacement: [data-testid="section-wrapper-overview"] -> [class*="Overview-module"][class*="summary"] holds the full text (1740 chars on Great Gatsby) even when collapsed behind 'Read more'
    - expect: Structured replacement (preferred): props.pageProps.context.structuredContent.modules[] where type === 'text', .text is HTML - 2219 chars on Battle of the Bands whose rendered page is only a 'Sales ended' shell with no overview
    - expect: => a DOM-only fix still leaves sales-ended events description-less
  6. Check listing cards for a fallback date
    - expect: Card date line: li .discover-search-desktop-card [class*="EventCardMetaLines-module__metaLine"] (line 1 = date+time, line 2 = 'Venue · Suburb'); each card is duplicated as mobile+desktop variants, so scope to the desktop card or use .first()
    - expect: Formats: 'Today • 7:00 PM', 'Tomorrow • 6:00 PM', 'Saturday • 3:00 PM', 'Sat, Nov 14 • 2:00 PM'; multi-session cards append ' + N more' (e.g. 'Saturday • 9:00 PM + 3 more')
    - expect: Series are NOT marked on cards: The Ten Virgins card reads 'Saturday • 2:00 PM' while its detail page is 'Multiple dates' - card date is a weak last-resort fallback only
  7. Check blockers / consent / removed events
    - expect: No login wall, no CAPTCHA on any of the 6 URLs
    - expect: Transcend consent markup (#cookieBanner-8020908, #transcend-consent-banner) is injected but no accept button is visible and no click was intercepted in headless runs
    - expect: Sales-ended pages (Battle of the Bands, Awaba) render a stripped 'View all event details' shell: no price/venue/overview in the DOM, but __NEXT_DATA__ still has everything
    - expect: A removed/404 event yields no props.pageProps.context.basicInfo - must be guarded

#### 1.2. Multi-date detection and skip rules

**File:** `specs/eventbrite-datetime-scraping-plan.md`

**Steps:**
  1. Structured primary rules (authoritative)
    - expect: SKIP when basicInfo.isSeries === true
    - expect: SKIP when basicInfo.isParentEvent === true
    - expect: SKIP when abs(endDate - startDate) > 24h - catches multi-day singles that are NOT series (Watchfest 2026 isSeries false, 52h; Subsonic 63h)
    - expect: DO NOT skip a midnight-crossing single session (Mansions 21:00->03:00 = 6h) - keep it
    - expect: Return and log the specific reason ('series' | 'date-range 52h' | 'dom-multiple-dates' | 'jsonld-schedule')
  2. DOM corroboration (scoped selectors only)
    - expect: Read only [data-testid="event-datetime"].first() and [data-testid="conversion-bar-date"].first() - never body.innerText (i18n injects 'Multiple dates' everywhere)
    - expect: SKIP when trimmed text matches /^multiple dates$/i or equals pageProps.messages['Multiple dates'] (locale-safe)
    - expect: SKIP when text contains two date expressions (two weekday names or two month-day pairs around a dash), e.g. /(mon|tue|wed|thu|fri|sat|sun)[a-z]*[^0-9]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{1,2}\s*[-–—]\s*/i
    - expect: SKIP when text shows a second showtime joined by '&' / ' and ' / ' + N more' (multi-showtime same day)
    - expect: Tiebreaker only: document.title ends with ', Multiple dates' (true 5/5, English locale)
  3. JSON-LD fallback rules
    - expect: If __NEXT_DATA__ is unavailable: SKIP when Event.eventSchedule is an array with >1 entry, or startDate/endDate are different dates AND span >24h
    - expect: Never use the JSON-LD date alone when isSeries is readable
  4. Skip early and log loudly
    - expect: Run the check immediately after page load, BEFORE price/organiser/venue/map/description work
    - expect: Do not push the event to events[] and do not pass it to sanitizeAndWriteToStagingFile
    - expect: console.warn(`Skipping ${eventName}: multiple dates/sessions (reason=..., start=..., end=..., tickets=${ticketLink})`)
    - expect: Navigate back to the listing URL for pageNumber and continue, exactly like the existing loop
    - expect: Final summary: `Eventbrite: N cards seen, M written, K skipped (multi-date), D duplicates, E errors`

#### 1.3. eventDateTime / eventStartTime / eventEndTime extraction

**File:** `specs/eventbrite-datetime-scraping-plan.md`

**Steps:**
  1. Read the structured payload once per detail page
    - expect: await page.evaluate(() => { const el = document.getElementById('__NEXT_DATA__'); if (!el) return null; try { const c = JSON.parse(el.textContent)?.props?.pageProps?.context; return c ? { startDate: c.basicInfo?.startDate, endDate: c.basicInfo?.endDate, isSeries: c.basicInfo?.isSeries, isParentEvent: c.basicInfo?.isParentEvent, hideStartDate: c.basicInfo?.hideStartDate, status: c.basicInfo?.status, timezone: c.basicInfo?.startDate?.timezone, salesStatus: c.salesStatus?.salesStatus } : null; } catch { return null; } })
    - expect: Return only the trimmed object - the full context includes galleries and is expensive to serialise
    - expect: Guard everything with try/catch: missing basicInfo must not throw
  2. Derive eventDateTime (primary + fallbacks)
    - expect: PRIMARY: DateTime.fromISO(startDate.utc).toUTC().toISO() -> '2026-09-12T11:00:00.000Z' (Z style matches existing data)
    - expect: FALLBACK A (no .utc): DateTime.fromISO(startDate.local, { zone: startDate.timezone || 'Australia/Sydney' }).toUTC().toISO() - .local has NO offset; omitting the zone shifts by 10-11h
    - expect: FALLBACK B: JSON-LD Event.startDate via DateTime.fromISO(value) (already carries +10:00/+11:00)
    - expect: FALLBACK C: normalised [data-testid="event-datetime"] text through parseDate + year resolution (parsed date >30 days in the past -> +1 year)
    - expect: Always set event.localTimeZone = startDate.timezone || 'Australia/Sydney'
  3. Derive eventStartTime / eventEndTime
    - expect: eventStartTime = DateTime.fromISO(startDate.local, { zone: tz }).toFormat('h:mm a') -> '9:00 PM' (matches ozTix's canonical shape)
    - expect: eventEndTime = DateTime.fromISO(endDate.local, { zone: tz }).toFormat('h:mm a') -> '3:00 AM' for Mansions; do not reject a next-day end and do not move eventDateTime to the end date
    - expect: Leave them undefined when the structured field is missing; never invent them
    - expect: Sanity: start.utc < end.utc, else drop eventEndTime
  4. DOM text parser as last resort
    - expect: Normalise: text.replace(/\u00A0/g,' ').replace(/\s*[•·]\s*/g,' · ').replace(/\s+/g,' ').trim()
    - expect: Two dates or '+ N more' in the normalised text -> multi-date, skip (safety net when flags are missing)
    - expect: Split only on the FIRST ' - ' when the remainder matches /^\d{1,2}(:\d{2})?\s*(am|pm)/i, otherwise treat it as a range and skip
    - expect: Strip leading 'Starts on ' and trailing ' (AEST)'/' (AEDT)' before parseDate

#### 1.4. eventDescription replacement

**File:** `specs/eventbrite-datetime-scraping-plan.md`

**Steps:**
  1. Switch to the structured description
    - expect: Primary: structuredContent.modules.filter(m => m.type === 'text').map(m => m.text).join('\n') (HTML)
    - expect: HTML->text in the page context: await page.evaluate(h => { const d=document.createElement('div'); d.innerHTML=h; return d.innerText; }, html); then collapse 3+ blank lines
    - expect: Battle of the Bands -> 2219 chars even on the sales-ended shell; Games Night -> 290-char blurb; Mansions -> '' (genuinely no modules; do not fabricate)
    - expect: Fallback: [data-testid="section-wrapper-overview"] innerText minus 'Overview'/'Read more' (on-sale pages only)
    - expect: Legacy last: #event-description (0 matches today, harmless to retain)
    - expect: Do not truncate - the current sanitizer has no length limit

#### 1.5. parseDates.ts changes

**File:** `specs/eventbrite-datetime-scraping-plan.md`

**Steps:**
  1. Fix broken Luxon tokens
    - expect: Replace every 'ha' -> 'h a' and 'h:mma' -> 'h:mm a' (lines 18-32, 41); verified these combined tokens are unparsable for '7 PM'/'7:00 PM'
    - expect: Add explicit { zone: 'Australia/Sydney', locale: 'en-AU' } to every fromFormat call lacking a zone
    - expect: Add Eventbrite shapes: 'cccc, MMMM d h a', 'cccc, MMMM d h:mm a', 'ccc, LLL d h a', 'ccc, LLL d h:mm a', 'cccc, MMMM d' (date only), 'LLL d h:mm a'
    - expect: Keep the existing 'Starts on ' strip
  2. Avoid the AI fallback for Eventbrite
    - expect: parseDate currently falls through to aiGetDateTime() on failure - one wasted/chargeable call per 'Multiple dates' page
    - expect: Add parseDate(dateStr, { zone, allowAi: false }) or skip the event in the scraper when no structured data is available
    - expect: Return undefined, never throw
  3. Add year resolution
    - expect: Yearless formats default to the current year (2026)
    - expect: resolveEventYear(dt): dt < DateTime.now().minus({ days: 30 }) ? dt.plus({ years: 1 }) : dt - apply only to DOM-parsed values

#### 1.6. Implementation steps inside eventbrite.spec.ts (no rewrite)

**File:** `specs/eventbrite-datetime-scraping-plan.md`

**Steps:**
  1. Step 1 - add helpers, keep the listing loop
    - expect: getEventbriteContext(page), isMultiDateEvent({...}), parseEventbriteDateTime(startDate, endDate, tz), eventbriteDescription(page, ctx)
    - expect: luxon is already imported; no new dependencies needed
  2. Step 2 - replace lines 115-154 (date block)
    - expect: After goto(ticketLink): waitForLoadState('domcontentloaded') then waitForFunction(() => !!document.getElementById('__NEXT_DATA__'), null, { timeout: 10000 }).catch(() => {})
    - expect: const ctx = await getEventbriteContext(page); const dtText = await page.locator('[data-testid="event-datetime"]').first().innerText().catch(() => '')
    - expect: const multi = isMultiDateEvent({...}); if (multi.multi) { console.warn(...); goto listing; continue; }
    - expect: Else Object.assign(event, parseEventbriteDateTime(...)); only if eventDateTime is still undefined use the DOM/JSON-LD parser
    - expect: Delete the '[class*="date-info__full-datetime"]' branch (dead selector)
  3. Step 3 - replace lines 196-201 (description)
    - expect: event.eventDescription = await eventbriteDescription(page, ctx) when non-empty
    - expect: Run after the multi-date skip
  4. Step 4 - harden the loop
    - expect: try/catch per card: log, continue, never push a partial event without eventDateTime
    - expect: Fix off-by-one: const count = await listLocator.count() (currently -1 drops the last card)
    - expect: Dedupe by numeric id from /tickets-(\d+)/ instead of by name (incomplete-events.json holds the same event 4x: Battle of the Bands, Games Night, Homemade Saturdays)
    - expect: Optional: skip ctx.status === 'completed'
  5. Step 5 - leave working fields alone
    - expect: ticketCost [class*="priceTagWrapper"], eventPromoters [class*="organizer-listing-info-variant-b__name-link"], venue [data-testid="section-wrapper-location"] address h3/p, lngLat via map -> [aria-label="Walking directions"] daddr all still verified present
    - expect: Only the map click is overlay-sensitive - guard it

#### 1.7. Edge cases

**File:** `specs/eventbrite-datetime-scraping-plan.md`

**Steps:**
  1. Recurring series
    - expect: Games Night: isSeries true, 2026-09-10T19:00 -> 2026-12-10T20:30, 'every Thursday' in blurb -> SKIP (series)
  2. Date ranges
    - expect: Watchfest 52h and Subsonic 63h: isSeries false but two dates shown -> SKIP (date-range); identical daily times do not make it single
  3. Midnight-crossing session
    - expect: Mansions 21:00 Sep 12 -> 03:00 Sep 13 (6h) -> KEEP; eventDateTime 2026-09-12T11:00:00.000Z, start '9:00 PM', end '3:00 AM'
  4. Multiple showtimes same day
    - expect: Two times joined by '&'/'and' or '+ N more' -> SKIP via the text rule; isSeries normally already catches it
  5. Redirects / locale hosts
    - expect: www.eventbrite.com and .com.au resolve to the same event id and identical __NEXT_DATA__ shape (timezone Australia/Sydney)
    - expect: ticketLink carries ?aff=ebdssbdestsearch - keep for navigation, store the clean canonical URL if dedupe depends on it
    - expect: If page.url() no longer contains '/e/' + the same id (redirect to /d/...), log and skip
  6. Consent / overlays
    - expect: Transcend markup present but not visible in headless; if a visible accept button appears click it once (getByRole('button', { name: /accept|agree/i })) before the map click
    - expect: Keep the existing beforeEach request aborting for images/fonts/media
  7. Sold-out / cancelled / sales-ended
    - expect: salesStatus 'sales_ended' still exposes full basicInfo + description modules - decide on the date rules, not on the stripped chrome
    - expect: status 'completed' -> optional skip; 'live'/'started' normal
    - expect: JSON-LD eventStatus schema.org/EventCancelled -> skip and log 'cancelled'
    - expect: Missing basicInfo -> log the URL as an error and continue
  8. Timezones
    - expect: Use startDate.timezone ('Australia/Sydney'); .utc already encodes AEDT +11 / AEST +10 (19:00 local Nov 7 = 08:00Z; 21:00 local Sep 12 = 11:00Z)
    - expect: Never parse .local without a zone

#### 1.8. Verification checklist

**File:** `specs/eventbrite-datetime-scraping-plan.md`

**Steps:**
  1. Run against the 6 failing URLs
    - expect: 5 skips logged with reasons: Battle of the Bands (series), Games Night (series), Homemade Saturdays (series), Glasshouse x Sunday Sweats (series), The Ten Virgins (series)
    - expect: 1 write: MANSIONS x THE AFTERS SYDNEY -> eventDateTime '2026-09-12T11:00:00.000Z', start '9:00 PM', end '3:00 AM'
    - expect: No written row has an empty eventDateTime and no 'Multiple dates' event reaches staging-events.json
  2. Regression on known-good single-date pages
    - expect: Great Gatsby -> 2026-11-07T08:00:00.000Z, start '7:00 PM', end '10:00 PM', description ~1740 chars
    - expect: Barrington Coast Airshow -> 2026-11-06T22:00:00.000Z (09:00 AEDT Nov 7), start '9:00 AM', end '5:00 PM'
    - expect: Watchfest 2026 -> skipped as a date range, not written as a single day
  3. Data-file audit
    - expect: The 22 eventbrite rows with no eventDateTime are either skipped (multi-date) or backfilled with a correct ISO date on the next run
    - expect: eventDescription populated where modules exist; empty only when Eventbrite has none
  4. Assertions to keep in the test
    - expect: new Date(eventDateTime).toISOString() === eventDateTime
    - expect: No written event has isSeries/isParentEvent true and none spans >24h
    - expect: Every written event has localTimeZone 'Australia/Sydney'

---

# Extraction reference (verified live, 5 Nov 2026)

Everything below was checked with Playwright against the live pages plus a raw `curl` of each failing URL. Where a value differs from the current `src/scrappers/eventbrite.spec.ts`, the value here wins.

## 1. Why the current code fails (five independent defects)

| # | Defect | Evidence | Consequence |
|---|--------|----------|-------------|
| 1 | Legacy selector removed | `[class*="date-info__full-datetime"]` → **0 matches**; `[class*="date-info"]` → **0 matches** on all 6 URLs | `dateAndTime` stays `undefined` on every new-layout page |
| 2 | Separator changed | `[data-testid="event-datetime"]` innerText is `"Saturday, September 12  •  9 PM - 3 AM"`; separators are `U+00A0` NBSP wrapping `U+2022` bullet. Code does `split(" · ")` with `U+00B7` | `startTime` is never extracted; the whole string (with bullet) is handed to `parseDate` → unparsable |
| 3 | Luxon tokens invalid | `DateTime.fromFormat("Saturday, November 7 7 PM", "cccc, MMMM d ha")` → `isValid: false`, reason `unparsable`. Same for `h:mma` on `"7:00 PM"`. Only `"h a"` / `"h:mm a"` parse | Every `ha` / `h:mma` strategy in `src/helpers/parseDates.ts` (lines 18–32, 41) is dead for Eventbrite text |
| 4 | Description selector removed | `#event-description` → **0 matches** on all sampled pages, including pages with a visible long description | `eventDescription` is always empty (confirmed: 0 of 175 Eventbrite rows in `past-events.json` have a description) |
| 5 | Multi-date pages unsupported | 5 of the 6 URLs show literally `Multiple dates`; series dates span months; JSON-LD exposes only the first session | Would publish a wrong single date if parsed at all → new requirement: skip |

Also observed but out of scope: the per-card loop uses `count - 1`, silently dropping the last card, and dedupes by `eventName`, which is why `incomplete-events.json` contains Battle of the Bands ×4, Games Night ×4, Homemade Saturdays ×3.

## 2. Verified per-URL matrix

`isSeries` / `isParentEvent` come from `props.pageProps.context.basicInfo`. `start` / `end` are `startDate.local` / `endDate.local` (Sydney wall clock).

| Failing URL (id) | Title suffix | `[data-testid="event-datetime"]` | `isSeries` / `isParentEvent` | start → end (local) | Span | Verdict |
|---|---|---|---|---|---|---|
| battle-of-the-bands…1993656339780 | Multiple dates | `Multiple dates` | true / true | 2026-07-24T19:00 → 2026-09-18T21:30 | 56 d | **SKIP — series** |
| mansions-x-the-afters…1998936064579 | `Saturday, September 12 • 9 PM - 3 AM` | `Saturday, September 12  •  9 PM - 3 AM` | false / false | 2026-09-12T21:00 → 2026-09-13T03:00 | 6 h | **KEEP** (midnight crossing) |
| games-night…1999870003014 | Multiple dates | `Multiple dates` | true / true | 2026-09-10T19:00 → 2026-12-10T20:30 | 91 d | **SKIP — series** |
| homemade-saturdays…887309505617 | Multiple dates | `Multiple dates` | true / true | 2024-05-04T21:00 → 2026-12-20T04:00 | 2.5 y | **SKIP — series** |
| glasshouse-x-sunday-sweats…1978856625436 | Multiple dates | `Multiple dates` | true / true | 2025-12-27T21:00 → 2027-01-03T03:00 | 1 y | **SKIP — series** |
| the-ten-virgins…1997393828710 | Multiple dates | `Multiple dates` | true / true | 2026-11-07T14:00 → 2026-11-07T21:00 | 7 h | **SKIP — series** (same-day series: duration alone would not catch it) |

Additional layouts verified for rule coverage:

| Sample | `dt` text | flags | start → end | Verdict |
|---|---|---|---|---|
| watchfest-2026…1999845366325 | `Thursday, November 5-Saturday, November 7  •  5 PM-9 PM` | false / false | 2026-11-05T17:00 → 2026-11-07T21:00 (52 h) | SKIP — date range (not a series) |
| subsonic-music-festival-2026…1993762936614 | `Friday, November 13-Sunday, November 15` | false / false | 2026-11-13T09:00 → 2026-11-15T23:59 (63 h) | SKIP — date range |
| the-great-gatsby-party…1997823317322 | `Saturday, November 7  •  7 PM - 10 PM` | false / false | 2026-11-07T19:00 → 2026-11-07T22:00 | KEEP |
| barrington-coast-airshow-2026…1538916583929 | `Saturday, November 7  •  9 AM - 5 PM` | false / false | 2026-11-07T09:00 → 2026-11-07T17:00 | KEEP |
| the-chosen-season-6…2003738380435 | `Multiple dates` | true / true | 2026-11-06T19:00 → 2026-11-06T20:30 (same day!) | SKIP — series |
| bondi-lines-x-la-cueva…663416636017 | `Multiple dates` | true / true | 2023-06-24T21:00 → 2026-12-13T04:00 | SKIP — series |

> The Chosen and Ten Virgins prove that **duration is not sufficient** on its own: they are same-day series, so `isSeries` / `isParentEvent` must be the primary rule and the >24 h rule only catches non-series multi-day ranges.

## 3. Selector / JSON-path map

| ScrapedEvent field | Primary source | Fallback 1 | Fallback 2 | Notes |
|---|---|---|---|---|
| `eventDateTime` | `props.pageProps.context.basicInfo.startDate.utc` → `DateTime.fromISO(utc).toUTC().toISO()` | `startDate.local` + `{ zone: startDate.timezone }` → `.toUTC().toISO()` | JSON-LD `Event.startDate` (ISO with `+11:00`), then `parseDate(normalised dtText)` + year fix | `local` has **no offset** — never parse it without a zone |
| `eventStartTime` | `startDate.local` → `.toFormat("h:mm a")` → `"9:00 PM"` | derived from JSON-LD `startDate` | DOM `dt` text time part | Canonical `h:mm a`, same shape as `ozTix.spec.ts` |
| `eventEndTime` | `basicInfo.endDate.local` → `.toFormat("h:mm a")` → `"3:00 AM"` | JSON-LD `Event.endDate` | none | Keep next-day ends (midnight crossing); drop if `end <= start` |
| `localTimeZone` | `basicInfo.startDate.timezone` (`Australia/Sydney`) | hardcode `Australia/Sydney` | — | Set on every event, even when date extraction fails |
| Multi-date signal | `basicInfo.isSeries` **OR** `basicInfo.isParentEvent` **OR** span > 24 h | `[data-testid="event-datetime"]` text `Multiple dates` / two-date range / `+ N more` | JSON-LD `Event.eventSchedule.length > 1` | Never use `document.body.innerText` (i18n contains "Multiple dates" everywhere) |
| `eventDescription` | `context.structuredContent.modules[].text` where `type === "text"` (HTML) | `[data-testid="section-wrapper-overview"]` innerText minus `Overview` / `Read more` | `#event-description` (legacy, 0 matches today) | Structured source survives sales-ended shells |
| `eventName` | listing `h3` (keep as-is) | `basicInfo.name` | — | Unchanged |
| `ticketLink` | listing card `a` href (keep) | `basicInfo.url` | — | Strip `?aff=` if dedupe relies on it |
| `ticketCost` | `[class*="priceTagWrapper"]` (keep) | JSON-LD `offers.lowPrice` | — | Unchanged |
| `eventPromoters` | `[class*="organizer-listing-info-variant-b__name-link"]` (keep) | `basicInfo.organizer.name` | — | Unchanged |
| `venueName` / `venueAddress` | `[data-testid="section-wrapper-location"] address` `h3` / `p` (keep) | JSON-LD `location.name` / `location.address` | `basicInfo.venue` | Unchanged; missing on sales-ended shells |
| `lngLat` | map → `[aria-label="Walking directions"]` `daddr` (keep) | `basicInfo.venue.address` + geocode helper | — | Unchanged |
| Listing date (weak fallback only) | `li .discover-search-desktop-card [class*="EventCardMetaLines-module__metaLine"]` first line | none | — | Relative (`Today`, `Tomorrow`, weekday) or `Sat, Nov 14`; never a multi-date signal |

### Exact JSON shape (as observed)

```jsonc
props.pageProps.context.basicInfo = {
  id: "1998936064579",
  name: "MANSIONS x THE AFTERS SYDNEY",
  startDate: { timezone: "Australia/Sydney", local: "2026-09-12T21:00:00", utc: "2026-09-12T11:00:00Z" },
  endDate:   { timezone: "Australia/Sydney", local: "2026-09-13T03:00:00", utc: "2026-09-12T17:00:00Z" },
  isSeries: false, isParentEvent: false, isTimedEntry: false,
  hideStartDate: false, hideEndDate: false,
  status: "completed", isOnline: false
  // …
}
props.pageProps.context.goodToKnow.highlights.nextAvailableSession = "2026-11-07T14:00:00+11" // series only
props.pageProps.context.salesStatus.salesStatus = "sales_ended"
props.pageProps.context.structuredContent.modules = [{ type: "text", text: "<p>…</p>" }, { type: "image", text: "" }]
```

## 4. Multi-date skip algorithm (ordered, first match wins)

```ts
type MultiVerdict = { multi: boolean; reason?: string };

function isMultiDateEvent(input: {
  isSeries?: boolean;
  isParentEvent?: boolean;
  startDateUtc?: string | null;
  endDateUtc?: string | null;
  dtText?: string;
  title?: string;
  jsonLdScheduleLength?: number;
}): MultiVerdict {
  // 1. structured flags — authoritative (catches same-day series)
  if (input.isSeries) return { multi: true, reason: "series (isSeries)" };
  if (input.isParentEvent) return { multi: true, reason: "series (isParentEvent)" };

  // 2. multi-day span for non-series ranges
  if (input.startDateUtc && input.endDateUtc) {
    const span = DateTime.fromISO(input.endDateUtc).diff(DateTime.fromISO(input.startDateUtc), "hours").hours;
    if (span > 24) return { multi: true, reason: `date range (${Math.round(span)}h)` };
  }

  // 3. JSON-LD schedule
  if ((input.jsonLdScheduleLength ?? 0) > 1) return { multi: true, reason: "eventSchedule has multiple sessions" };

  // 4. DOM text (scoped element only)
  const text = (input.dtText ?? "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
  if (/^multiple dates$/i.test(text)) return { multi: true, reason: "dom: 'Multiple dates'" };
  if (/\+\s*\d+\s*more/i.test(text)) return { multi: true, reason: "dom: '+ N more'" };
  const dateTokens = text.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{1,2}\b/gi) ?? [];
  const weekdayTokens = text.match(/\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/gi) ?? [];
  if (dateTokens.length > 1) return { multi: true, reason: "dom: date range" };
  if (weekdayTokens.length > 1 && /[-–—]/.test(text)) return { multi: true, reason: "dom: weekday range" };
  if (/\d\s*(am|pm)\s*(?:&|and)\s*\d/i.test(text)) return { multi: true, reason: "dom: multiple showtimes" };

  // 5. title tiebreaker (English only)
  if (/,\s*multiple dates\s*$/i.test(input.title ?? "")) return { multi: true, reason: "title suffix" };

  return { multi: false };
}
```

Skip handling in the loop:

```ts
const verdict = isMultiDateEvent({ /* … */ });
if (verdict.multi) {
  skippedMultiDate += 1;
  console.warn(
    `Skipping "${eventName}" — multiple dates/sessions (${verdict.reason}); ` +
    `start=${ctx?.startDate?.local ?? "?"} end=${ctx?.endDate?.local ?? "?"} ${event.ticketLink}`,
  );
  await page.goto(listingUrl(pageNumber));
  await page.waitForLoadState("domcontentloaded");
  continue;
}
```

> `pageProps.messages["Multiple dates"]` exists on **every** page. A raw-HTML or `body.innerText` check would mark every event as multi-date. Only the scoped `[data-testid="event-datetime"]` node and the structured flags are trustworthy.

## 5. eventDateTime extraction (primary path)

```ts
const ctx = await page.evaluate(() => {
  const el = document.getElementById("__NEXT_DATA__");
  if (!el) return null;
  try {
    const c = JSON.parse(el.textContent ?? "{}")?.props?.pageProps?.context;
    if (!c) return null;
    return {
      startDate: c.basicInfo?.startDate ?? null,
      endDate: c.basicInfo?.endDate ?? null,
      isSeries: c.basicInfo?.isSeries ?? false,
      isParentEvent: c.basicInfo?.isParentEvent ?? false,
      hideStartDate: c.basicInfo?.hideStartDate ?? false,
      status: c.basicInfo?.status ?? null,
      timezone: c.basicInfo?.startDate?.timezone ?? "Australia/Sydney",
      salesStatus: c.salesStatus?.salesStatus ?? null,
      descriptionHtml: (c.structuredContent?.modules ?? [])
        .filter((m: { type: string }) => m.type === "text")
        .map((m: { text: string }) => m.text)
        .join("\n"),
      moduleCount: (c.structuredContent?.modules ?? []).length,
    };
  } catch {
    return null;
  }
});

const tz = ctx?.timezone ?? "Australia/Sydney";
const start = ctx?.startDate?.utc
  ? DateTime.fromISO(ctx.startDate.utc, { zone: "utc" })
  : ctx?.startDate?.local
    ? DateTime.fromISO(ctx.startDate.local, { zone: tz })
    : undefined;

if (start?.isValid) {
  event.eventDateTime = start.toUTC().toISO() ?? undefined;
  event.eventStartTime = start.setZone(tz).toFormat("h:mm a");
  const end = ctx?.endDate?.utc
    ? DateTime.fromISO(ctx.endDate.utc, { zone: "utc" })
    : ctx?.endDate?.local
      ? DateTime.fromISO(ctx.endDate.local, { zone: tz })
      : undefined;
  if (end?.isValid && end > start) event.eventEndTime = end.setZone(tz).toFormat("h:mm a");
} else {
  // FALLBACK B: JSON-LD Event.startDate (already offset-correct)
  // FALLBACK C: normalised [data-testid="event-datetime"] text -> parseDate -> resolveEventYear
}
event.localTimeZone = tz;
```

Notes:
* `startDate.utc` is `"2026-09-12T11:00:00Z"`; `DateTime.fromISO(..., { zone: "utc" })` → `.toUTC().toISO()` = `"2026-09-12T11:00:00.000Z"`, matching the `Z` style already present in the data files.
* `startDate.local` is wall clock with no offset. With `{ zone: "Australia/Sydney" }` the same value resolves to the same instant (verified: `2026-09-12T21:00:00` + Sydney = `11:00Z`; `2026-11-07T19:00:00` + Sydney = `08:00Z`, i.e. AEDT `+11` is applied automatically).
* Only the **start** date feeds `eventDateTime`. A next-day end never shifts the event.

## 6. parseDates.ts: what to change and why

Verified with `luxon@3.6.1` on this repo:

| Input | Format currently tried | Result | Fix |
|---|---|---|---|
| `Saturday, November 7 7 PM` | `cccc, MMMM d ha` | invalid (`unparsable`) | `cccc, MMMM d h a` |
| `Saturday, November 7 7:00 PM` | `cccc, MMMM d h:mma` | invalid (`unparsable`) | `cccc, MMMM d h:mm a` |
| `Sat, Nov 14 2:00 PM` | none matching | invalid | add `ccc, LLL d h:mm a` |
| `Saturday, November 7` | none matching | invalid | add `cccc, MMMM d` |
| `Multiple dates` | all | invalid | never call `parseDate`; skip earlier |
| `Friday, November 13-Sunday, November 15` | all | invalid | never call `parseDate`; skip earlier |

Concrete edits:

1. Replace `"ha"` → `"h a"` and `"h:mma"` → `"h:mm a"` in all strategies (lines 18–32, 41). Keeping the old strings is harmless but dead.
2. Add `{ zone: "Australia/Sydney", locale: "en-AU" }` to strategies at lines 18–39 that currently omit a zone. Without it, a UTC CI runner produces a 10–11 h error.
3. Add the Eventbrite shapes listed above.
4. Guard the AI fallback: `parseDate(input, { allowAi = true, zone = "Australia/Sydney" } = {})`; the Eventbrite scraper should pass `allowAi: false` (or skip when structured data is absent) so `Multiple dates` never triggers a chargeable AI call.
5. Add `resolveEventYear(dt)` (if `dt < now.minus({ days: 30 })`, add one year) and use it only for yearless DOM parses. A January 2027 event parsed in November 2026 otherwise becomes a past 2026 date and is dropped by `deleteOldEvents`.

The current file also has `dateStr.replace(" · ", ...)` style assumptions in the scraper, not in `parseDates.ts` — the NBSP/bullet normalisation belongs in the scraper's DOM fallback, not in the shared helper.

## 7. Implementation checklist for `src/scrappers/eventbrite.spec.ts`

Do this as an in-place edit; every other field keeps working.

1. **Add** `getEventbriteContext(page)`, `isMultiDateEvent(input)`, `parseEventbriteDateTime(startDate, endDate, tz)`, `eventbriteDescription(page, ctx)` above `test("Scrape eventbrite", …)`.
2. **Hoist** the listing URL into a `const listingUrl = (p: number) => "https://www.eventbrite.com/d/australia--" + city.cityName + "/music--events--this-week/?page=" + p;` so the skip/return path cannot drift from the initial goto.
3. **Replace** lines 115–154 (date block) with: context read → `isMultiDateEvent` → skip-and-continue → structured date assign → fallback chain.
4. **Move** the multi-date skip **above** the `priceTagWrapper` / organiser / venue / map work (currently lines 100–194) so skipped pages cost one navigation.
5. **Replace** lines 196–201 (`#event-description`) with `eventbriteDescription(page, ctx)`.
6. **Wrap** the per-card body in `try { … } catch (err) { console.error("Failed " + eventName, err); continue; }`.
7. **Fix** `const count = (await listLocator.count()) - 1;` → `const count = await listLocator.count();`.
8. **Dedupe** by the numeric id from `/tickets-(\d+)/` (also compare against `pastEvents`, `config.eventFiles.staging` and the in-run `events` array).
9. **Log** a final summary: `Eventbrite: ${cardsSeen} seen, ${events.length} written, ${skippedMultiDate} multi-date skipped, ${duplicates} duplicates, ${errors} errors`.
10. **Do not touch** `ticketCost`, `eventPromoters`, `venue*`, `lngLat`, `eventBannerImage`, `ticketLink` extractors — all verified still present.

Optional (recommended) hardening:

* `ctx?.status === "completed"` → skip past sessions so re-runs stop re-adding this week's already-finished shows.
* If `page.url()` no longer matches `/e/.*tickets-(\d+)/`, treat the page as removed/redirected and skip.
* Defensive consent dismiss before the map click: `page.getByRole("button", { name: /accept|agree/i }).first().click({ timeout: 1000 }).catch(() => {})`.

## 8. Edge cases

| Case | Detection | Behaviour |
|---|---|---|
| Recurring weekly series (`every Thursday`) | `isSeries` / `isParentEvent` | Skip, reason `series` |
| Multi-day date range, not a series (Watchfest, Subsonic) | span > 24 h and/or two dates in `dt` | Skip, reason `date range (52h)` |
| Same-day series (Ten Virgins, The Chosen) | `isSeries` (duration is only 7 h / 1.5 h) | Skip, reason `series` — **duration alone is insufficient** |
| Midnight-crossing single session (Mansions 21:00 → 03:00) | span ≤ 24 h, `isSeries` false, one date in `dt` | Keep; `eventDateTime` from start, `eventEndTime` `3:00 AM` |
| Multiple showtimes, one date (`2 PM & 7 PM`, `+ 1 more`) | `dt` `&`/`and`/`+ N more` (or `isSeries`) | Skip |
| Sales-ended / completed | `salesStatus.salesStatus === "sales_ended"`, `status === "completed"` | Decide on date rules only; detail chrome is stripped but `__NEXT_DATA__` is complete. Optionally skip `completed` |
| Sold out | `salesStatus` / DOM `Almost full` chip | Still scrape (ticketCost may be absent) |
| Cancelled | JSON-LD `eventStatus: https://schema.org/EventCancelled`, or `cancelled` in name (already filtered in `sanitizeAndWriteToStaging`) | Skip + log `cancelled` |
| Removed / redirect to `/d/…` | no `basicInfo`, URL changed | Log error, continue |
| Consent overlay (Transcend) | not visible in headless; may appear in headed runs | One defensive dismiss before the map click |
| `.com` vs `.com.au` | identical payload, same event id, `timezone` still `Australia/Sydney` | No special handling needed |
| Hidden start date (`hideStartDate: true`) | `dt` shows `Starts on …` | Use structured `startDate` anyway; strip `Starts on ` in the DOM fallback |
| Missing `endDate` | `endDate` null | Leave `eventEndTime` undefined; do **not** skip |
| DST boundary in a range | `startDate.utc` / `endDate.utc` carry the correct offsets independently | Always convert from `.utc`, never from `.local` without a zone |

## 9. Verification checklist (run after the change)

1. `npx playwright test src/scrappers/eventbrite.spec.ts --project=newcastle` → expect `5 multi-date skipped`, `1 written` for the sample set.
2. Assert per URL:
   * `battle-of-the-bands…` → skipped, reason contains `series`
   * `mansions-x-the-afters…` → `eventDateTime === "2026-09-12T11:00:00.000Z"`, `eventStartTime === "9:00 PM"`, `eventEndTime === "3:00 AM"`
   * `games-night…` → skipped (`series`, 91-day span)
   * `homemade-saturdays…` → skipped (`series`)
   * `glasshouse-x-sunday-sweats…` → skipped (`series`)
   * `the-ten-virgins…` → skipped (`series`, same-day)
3. Regression (single-date pages): Great Gatsby → `2026-11-07T08:00:00.000Z`; Barrington Airshow → `2026-11-06T22:00:00.000Z`; Watchfest → skipped as a range.
4. `eventDescription` non-empty for Games Night / Glasshouse / Homemade Saturdays (their modules exist); empty only for Mansions (no modules on the page).
5. Re-audit `src/eventFiles/newcastle/incomplete-events.json`: every remaining `source: "eventbrite"` row must be a deliberate multi-date skip, not a parse failure.
6. Sanity invariants on output: `new Date(eventDateTime).toISOString() === eventDateTime`; no written event has `isSeries`/`isParentEvent` true; no written event spans > 24 h; `localTimeZone === "Australia/Sydney"`.
