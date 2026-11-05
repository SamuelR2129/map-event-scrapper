# Hamilton Station Hotel Music Scraping Plan

## Application Overview

Scraping plan for extracting gig-guide events from https://www.thehamiltonstationhotel.com/music - the "Music" page of The Hamilton Station Hotel, 2-6 Beaumont Street, Islington NSW 2296 (Newcastle, Australia; Australia/Sydney, AEDT UTC+11 in October). The site is still Squarespace, but the gig guide is **no longer static HTML**: the single `.sqs-block-code` code block on the page loads an embedded Oztix "event guide" widget (`div.ot-event-feed` > `div.filters-and-events-container` > `main#aef-event-guide-hits`), which is an Algolia InstantSearch `infiniteHits` list. Each event is a server-empty, client-rendered `li.ais-InfiniteHits-item > article.hit` card containing banner image, event name, optional `Special Guests:` line, optional `Free Entry` badge and the start date/time. There is no pagination URL and no tabs, but there **is** a `button.ais-InfiniteHits-loadMore` ("Show more events") plus an `autoLoadOnScroll` connector, so the list must be expanded in-page: observed 24 Oct 2026 the index held **41 events** (7 pages x `hitsPerPage = 6`), ascending from 2026-10-24 to 2027-03-18, of which only 12-18 cards are in the DOM on first paint. Cards are single anchors (`target="_blank"`) that leave the site for `https://tickets.oztix.com.au/outlet/event/{guid}?utm_source=HamiltonStationHotel&utm_medium=EventFeed` - **there is no venue-hosted event detail page**, and therefore no detail-page pass. The listing exposes name, date, start time, support acts, banner, free/not-free and the ticket URL; price, description, genre categories, exact UTC timestamp and coordinates exist only in the backing Algolia payload (`POST https://icgfyqwgtd-dsn.algolia.net/1/indexes/*/queries`, app `ICGFYQWGTD`, index `prod_oztix_eventguide_past_events_first`, key scoped to `Venue.Name:"The Hamilton Station Hotel"`), which the page itself requests on load and which is the recommended enrichment/fallback source. Source-of-truth warnings: `DateStart` in that payload is a UTC instant without an offset (`"2026-10-24T08:30:00"`) while the card renders the Sydney wall clock (`7:30PM`) - never mix them; the year is omitted from the card unless it differs from the current year (10 of 41 cards carry `.date-year` = `2027`); `PriceFrom: 0` does **not** mean free (10 of 41 events are $0 but ticketed); and the widget itself removes any event once the venue-local day is over, so earlier days of the Wed-Sun window disappear from the feed rather than merely being filtered out. Site JSON-LD contains only `WebSite`, `Organization` (address "6 Beaumont Street", sameAs Facebook/Instagram) and `LocalBusiness` - no `Event` markup; `/music?format=ical` returns the HTML page and is unusable. Coordinates come from the hit `_geoloc`: lngLat = `[151.7491912841797, -32.91740036010742]`. Venue name `The Hamilton Station Hotel`; local timezone `Australia/Sydney`.

## Test Scenarios

### 1. Extraction Plan

**Seed:** ``

#### 1.1. Page Structure Analysis

**File:** `specs/hamilton-station-hotel-analyzer.md`

**Steps:**
  1. Navigate to https://www.thehamiltonstationhotel.com/music
    - expect: `document.title` is exactly `The Hamilton Station Hotel`
    - expect: The only `h1` is the logo heading (`h1#logoImage` wrapping `img`), so the heading has no text; there is **no** "GIG GUIDE" heading and no visible page title
    - expect: No login wall, CAPTCHA, cookie/consent banner or overlay; `document.body.innerText` matches neither `/cookie/i` nor `/consent/i`
    - expect: Header nav is HOME / MUSIC / FOOD / KARAOKE / SPORT / MERCH / THE VIBE / CONTACT, each a relative link (`/music`, `/food`, ...)
  2. Confirm the pre-2026 markup is gone
    - expect: `.sqs-html-content` exists twice but contains only 3 `<p>` elements in total - the booking blurb ("Please include your band/artist name, links to your music..."), the Awabakal acknowledgement and one empty `data-rte-preserve-empty` paragraph
    - expect: Zero event paragraphs: no `<p><strong>WEDNESDAY, JULY 15TH</strong>...`, no `Front Bar`, no `Band Room`, no `Doors`, no `presents:`, no `$` price text and no `SOLD OUT` anywhere in the rendered body
    - expect: The old locator `.sqs-html-content p` (used by `src/scrappers/hamiltonStationHotel.spec.ts`) now returns 0 events - the existing scraper is stale
  3. Locate the event feed container
    - expect: The feed is the only `.sqs-block-code` on the page: `.sqs-block-code` > `.ot-event-feed` > `.filters-and-events-container` > `.results-container` > `main#aef-event-guide-hits`
    - expect: `main#aef-event-guide-hits` is `main.ais-InfiniteHits` containing `ol.ais-InfiniteHits-list`, and every card is `li.ais-InfiniteHits-item > article.hit`
    - expect: Generated Squarespace ids look like `yui_3_17_2_1_...`; never use them - only the widget classes/ids above are stable
    - expect: Above the list `.ais-RefinementList` renders 10 category pills with counts (`Australian Artists 25`, `Music 22`, `Punk 14`, `Rock 12`, `Indie 10`, `Metal / Hard Rock 9`, ...) and two `input.ais-SearchBox-input` boxes (`Search for events`, `Search categories...`); the default state is unfiltered - do not type in or click these
  4. Measure the list and its pagination state
    - expect: On first paint only 12-18 `article.hit` cards exist (observed 12 and 18 on two loads), although the index reports more
    - expect: `button.ais-InfiniteHits-loadMore` with text `Show more events` is present and enabled while more pages remain
    - expect: Full dataset observed on 24 Oct 2026 = **41 events** = 7 pages of 6 (`hitsPerPage = 6`), ascending by start date from `Sat Oct 24th` 2026 to `Thu Mar 18th 2027`
    - expect: No `?page=`, no "Older/Newer", no tabs, no URL change while loading more
  5. Verify the load-more behaviour and terminal state
    - expect: Clicking `button.ais-InfiniteHits-loadMore` adds more than one page at a time (observed 12 -> 30 -> 41) because the widget also runs an `autoLoadOnScroll` IntersectionObserver; never assume "+6 per click"
    - expect: `window.scrollTo(0, document.body.scrollHeight)` alone did not add cards in the test run - drive the button and assert on card count instead
    - expect: When exhausted the button becomes `disabled`, gains `ais-InfiniteHits-loadMore--disabled`, and computes to `display: none`; the 41st card is `Hard-Ons with Jerry A — Newcastle`
    - expect: Stop condition must be "card count unchanged across an iteration" or "button disabled/hidden", not a fixed click count
  6. Inspect the anatomy of a card (e.g. the `HELL RIPS THE HAMO VOL. XVI` card)
    - expect: Whole card is `<a href="https://tickets.oztix.com.au/outlet/event/c7a2c6bb-...?utm_source=HamiltonStationHotel&utm_medium=EventFeed" target="_blank" rel="noopener">`
    - expect: Banner `.event-picture img` - `src="https://assets.oztix.com.au/image/{uuid}.png?width=600&height=300&format=webp&quality=80"`, matching `srcset` at 300/500/800/1100w, `alt` = event name, `loading="lazy"`; all 41 cards have an image
    - expect: Name `.event-name` > `span.ais-Highlight` > `span.ais-Highlight-nonHighlighted`; textContent is the clean event name (highlight markup only appears if a search query is typed)
    - expect: Support acts `.special-guests-container` > `.special-guests-prefix` ("Special Guests:") + `.special-guests` (e.g. `The Loom Of Time, The Veil (Album Launch), Exsister, Bellwether`); `.special-guests` is absent/empty for 11 of 41 cards - the prefix text must never leak into the name
    - expect: Free badge `.free-event-container > span.free-event-badge` with text `Free Entry` (rendered uppercase by CSS) on exactly 3 cards: `End Of Semester Send!`, `CB GHOST | 'All Good Things Take Time' Tour`, `Terra Meridian + Birdwatcher + Bellwether`
    - expect: Date `.date-part` > `.date-text` contains BOTH spellings of day and month, e.g. textContent `SaturdaySat OctoberOct 24th`; the visible one is chosen by CSS at card width, so textContent is unsafe to parse directly
    - expect: `.day-short` = `Sat`, `.month-short` = `Oct`, trailing ordinal `24th` as a bare text node; `.date-year` is absent for current-year events
    - expect: `.time` textContent `7:30PM` (`7:30` + `span.time-suffix` `PM`); no `time` element, no end time, no doors time, no venue/room line anywhere in the card
  7. Check year rendering on a 2027 card
    - expect: `.date-part.has-year` adds `<span class="date-year">2027</span>` after `.date-text`; card innerText reads `Thu Mar 18th 2027`
    - expect: Exactly 10 of the 41 cards carry `.date-year` (all `2027`: 21/22/24/26 Jan, 4/18/19/26 Feb, 5/18 Mar)
    - expect: Cards in the current year (2026) carry no year element at all, including the 31 Dec 2026 New Year's Eve event
  8. Confirm there is no per-event detail page
    - expect: Clicking a card opens the Oztix ticket page in a new tab; the venue site exposes no `/music/{slug}` route and no `[href*="/music/"]` inside cards
    - expect: Every ticket href is absolute and on `tickets.oztix.com.au` (0 relative hrefs, 0 other ticket domains in the current dataset)
  9. Record the backing data call
    - expect: On load the page POSTs `https://icgfyqwgtd-dsn.algolia.net/1/indexes/*/queries` with `x-algolia-application-id: ICGFYQWGTD` and `x-algolia-api-key: bcfeb93f96442f90c6988a4402d82650`, index `prod_oztix_eventguide_past_events_first`, `hitsPerPage: 6`, pages 0..n
    - expect: The query body filters only by date - `(DateEndUnix >= <now-48h> OR DateStartUnix >= <now-48h>)` - the venue restriction is baked into the secured key, so the same key returns only Hamilton Station Hotel hits
    - expect: The page also defines `venueNameFilter = []`, `utmSource = 'HamiltonStationHotel'`, `utmMedium = 'EventFeed'`, `timeLabelText = ''`, `hitsPerPage = 6` in its inline "FEED SETTINGS" block
    - expect: Hits carry `EventId`, `EventGuid`, `EventName`, `SpecialGuests`, `EventDescription` (HTML), `DateStart` (UTC, no offset), `DateStartUnix`, `DateEnd`, `EventUrl`, `Categories[]`, `_geoloc{lat,lng}`, `Venue{Name,Address,Locality,State,Postcode,Timezone}`, `PriceFrom`, `MinPrice`, `IsCancelled`, `IsPostponed`
  10. Check auxiliary sources
    - expect: `script[type="application/ld+json"]` count is 3 - `WebSite`, `Organization` (`sameAs`: facebook.com/TheHamiltonStationHotel, instagram.com/hamiltonstationhotel; address `6 Beaumont Street, Islington, NSW, 2296`) and `LocalBusiness`; **no** `Event` JSON-LD
    - expect: `https://www.thehamiltonstationhotel.com/music?format=ical` returns 200 `text/html` (the page), not a calendar feed
    - expect: No RSS link, no `/api/...` event endpoint, no Squarespace events collection (`article.eventlist-event` count = 0)
    - expect: Only other network traffic is `/api/census/render-batch`, Google Analytics, Sentry, Facebook pixel and the Spotify embed iframe
  11. Note anti-scraping posture
    - expect: No authentication, no CAPTCHA, no rate limiting observed across repeated loads; `robots.txt` (Squarespace default) allows `/music` and only disallows `/config`, `/search`, `/account/`, `/commerce/digital-download/`
    - expect: `robots.txt` blocks AI-crawler user agents (`GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`, ...); a normal browser profile is used and no AI UA string is set
    - expect: Page weight is dominated by third parties (Algolia, Spotify iframe, analytics); aborting images/fonts/media plus analytics hosts keeps the run small

#### 1.2. Field Extraction Patterns

**File:** `specs/hamilton-station-hotel-extraction.md`

**Steps:**
  1. Expand the whole list before extracting
    - expect: `await page.goto("https://www.thehamiltonstationhotel.com/music", { waitUntil: "domcontentloaded" })`, then `await page.locator("article.hit").first().waitFor()`
    - expect: Loop: read `article.hit` count, click `button.ais-InfiniteHits-loadMore` if visible/enabled, `waitForTimeout(1000)`, repeat - break when the count is unchanged from the previous iteration or the button is disabled/hidden (hard cap 12 iterations)
    - expect: Map all cards with one `page.locator("article.hit").evaluateAll(...)` pass after the loop (41 cards observed); no navigation is needed afterwards
    - expect: Optional early exit: cards are date-ascending, so once the last loaded card's date is greater than the window end, remaining pages cannot contribute to a Wed-Sun run
  2. Parse the event date
    - expect: Read each `.date-part` in the card; use `.day-short` (`Sat`), `.month-short` (`Oct`), the ordinal from `.date-text` via `/(\d{1,2})(?:st|nd|rd|th)/`, and `.date-year` if present (`2027`)
    - expect: Never parse `.date-text` textContent as a whole - it is `SaturdaySat OctoberOct 24th`; never rely on innerText either, because the full/short variant shown is a CSS breakpoint decision
    - expect: Single-day = 1 `.date-part`; a 2-part card means multi-day, second part = end date (0 of 41 at time of writing)
    - expect: Validate the parsed weekday against `.day-short`; log and skip the card if they disagree
  3. Infer the year
    - expect: `.date-year` present -> use it verbatim (`2027`)
    - expect: `.date-year` absent -> use the current year in Australia/Sydney
    - expect: New Year rollover guard: if the inferred date is earlier than `now.minus({ days: 1 })`, add one year (covers a page cached across 31 Dec while the year span was hidden)
    - expect: Verify against the widget logic: it prints the year only when `yearStart !== currentYear`, so Dec-2026 cards legitimately have no year while Jan-2027 cards do
  4. Parse the start time and build the timestamps
    - expect: `.time` textContent format is `h:mmA` with no space (`7:30PM`, `8:30PM`, `6:00PM`, `3:00PM`, `5:30PM`); observed time-of-day set across the 41 events is 3:00PM, 5:30PM, 6:00PM, 7:00PM, 7:30PM, 8:00PM, 8:30PM, 9:00PM
    - expect: `DateTime.fromFormat(`${dateStr} ${timeText}`, "yyyy-MM-dd h:mma", { zone: "Australia/Sydney" })`, with a fallback accept of `"yyyy-MM-dd h:mm a"` after normalising U+202F/U+00A0 spaces
    - expect: `eventStartTime = dt.toISO()` (local wall clock with offset, e.g. `2026-10-24T19:30:00.000+11:00`); `eventDateTime = dt.toUTC().toISO()` (e.g. `2026-10-24T08:30:00.000Z`)
    - expect: Missing `.time` -> fall back to date-only midnight: `eventDateTime = DateTime.fromISO(dateStr, { zone: "Australia/Sydney" }).toUTC().toISO()`, `eventStartTime` left undefined
    - expect: Do not reconstruct the time from Algolia unless you convert: `DateStart` `"2026-10-24T08:30:00"` is UTC; `DateTime.fromISO(hit.DateStart, { zone: "utc" }).setZone("Australia/Sydney")` -> 19:30. Treating it as local is an 11-hour error in AEDT
  5. Extract the event name
    - expect: `eventName = card.querySelector(".event-name")?.textContent` trimmed and whitespace-collapsed (name only - never `.event-card` innerText, which also contains guests, date and time)
    - expect: Fallback to `img[alt]`, which equals the name on all 41 cards
    - expect: Keep punctuation and unicode as served (`Alta Falls - ‘Don't Make Me A Number’ EP Tour`, `Hard-Ons with Jerry A — Newcastle`, `BRIDGE WHAT REMAINS – 2027 AUSTRALIAN TOUR`); only trim/normalise whitespace
    - expect: `id = randomUUID()`, `source = "hamilton_station_hotel"`
  6. Extract support acts and promoters
    - expect: `.special-guests` (scoped - not `.special-guests-prefix`) gives values such as `The Loom Of Time, The Veil (Album Launch), Exsister, Bellwether`, `Nana Klumpp, Loons, Rhodes`, `TBC`, `+ Fat Bald Idiot`, `w/ Feel The Pain`, `with special guests`
    - expect: `eventPromoters` is **undefined** - no promoter/presenter field exists in the card, the Algolia payload or the site JSON-LD; "Special Guests:" is a lineup label, not a promoter, and must not be mapped into either `eventPromoters` or `eventName`
    - expect: If a promoter is ever needed, the only candidate is a `presents` phrase inside `EventDescription` (1 of 41 hits contains `presents`); leave it out rather than guessing
  7. Extract room/time/venue fields
    - expect: `venueLocation` (room) is **no longer available** - no `Front Bar` / `Band Room` / doors text exists on the page or in the payload; set `venueLocation = "Newcastle, NSW, Australia"` (city-level) rather than inventing a room
    - expect: `venueName = "The Hamilton Station Hotel"` (card has no venue label; matches `Venue.Name` on all 41 hits)
    - expect: `venueAddress = "2-6 Beaumont Street, Islington, NSW 2296, Australia"` (Algolia `Venue.Address` = `2-6 Beaumont St`, `Locality` = `Islington`, `State` = `NSW`, `Postcode` = `2296`); the site's Organization JSON-LD says `6 Beaumont Street` - keep the Oztix/known value and do not read the address per event
    - expect: `venueLink = "https://www.thehamiltonstationhotel.com"`, `socialLink = "https://www.facebook.com/TheHamiltonStationHotel/"` (Organization `sameAs[0]`), `lngLat = [151.7491912841797, -32.91740036010742]`, `localTimeZone = "Australia/Sydney"`
  8. Extract ticket cost and ticket link
    - expect: Free is signalled only by `.free-event-badge` (`Free Entry`) -> `ticketCost = "Free Entry"`; the badge count (3) matches the `Free Event` category count exactly
    - expect: Paid prices are **not rendered**; when the Algolia payload is consulted, `ticketCost = "From $<PriceFrom>"` only when `PriceFrom > 0` (observed 13.8, 16.85, 22.45, 27.55, 30, 33.33, 43.35, 53.55, 58.65); otherwise leave undefined
    - expect: `PriceFrom === 0` is ambiguous and must not be treated as free - 10 of 41 events have `PriceFrom 0` without the `Free Event` category (e.g. `LifeLife / Hazyshade`, `KNIGHT FOR A CAUSE - Fundraiser`, `DIE JOB (CAN) - ... - FREE ENTRY`)
    - expect: Do not infer free from the event name or description (`DIE JOB ... - FREE ENTRY` has no `Free Event` category; `HAMOWEEN`'s description contains `$` for drink specials)
    - expect: `ticketLink` = the card anchor href, absolute, `https://tickets.oztix.com.au/outlet/event/{guid}?utm_source=HamiltonStationHotel&utm_medium=EventFeed`; canonicalise with the URL API and delete `utm_*`, `fbclid`, `igshid` -> `https://tickets.oztix.com.au/outlet/event/{guid}`
    - expect: Exactly one anchor per card, so no ambiguity about which link is the ticket link
  9. Extract the banner image
    - expect: `.event-picture img` `src` -> `https://assets.oztix.com.au/image/{uuid}.png?width=600&height=300&format=webp&quality=80`; keep the rendition query and rewrite it to `width=1200&height=600&format=webp&quality=80` for a banner-sized asset (verified 200, `image/webp`, ~48 KB)
    - expect: **Do not strip the query string** - the unparameterised original is a ~10.5 MB PNG (`content-type: image/png`, 10,519,504 bytes), which would blow up staging payloads
    - expect: Normalise protocol-relative/relative values with `new URL(src, page.url())` and force `https:`
    - expect: Fallback when a card has no image: the site logo `#logoImage img` (`//images.squarespace-cdn.com/.../logo+transparent.png?format=1500w`) - still present, protocol-relative - but 41/41 cards currently have their own image, so this is emergency-only
  10. Enrich description, genres and exact datetime from the Algolia payload
    - expect: Attach `page.on("response", ...)` for URLs matching `/1\/indexes\/\*\/queries/` **before** `page.goto`, `await response.json()`, and index `results[0].hits` by the GUID in `EventGuid`/`EventUrl` (lowercase) - the same GUID as the card href
    - expect: Option B (single request, preferred): parse app id/key/index from the inline widget script with `/liteClient\('([A-Z0-9]+)',\s*'([a-f0-9]+)'\)/` and `/indexName:\s*'([^']+)'/`, then POST `{requests:[{indexName, distinct:true, facets:["Categories"], hitsPerPage:100, page:0, query:"", filters:'(DateEndUnix >= <unix> OR DateStartUnix >= <unix>)'}]}` with `x-algolia-application-id` / `x-algolia-api-key` headers; one call returned all 41 hits
    - expect: `eventDescription` = `EventDescription` with `<br>`/`</p>` -> newline, other tags stripped, entities decoded (`&amp;`, `&#39;`, `&quot;`), whitespace collapsed; leave undefined when the field is `""` (5 of 41) or when running DOM-only
    - expect: `genres` = `Categories` minus the non-genre facets `Music`, `Australian Artists`, `Free Event`, joined with `", "` (e.g. `Heavy Metal, Metal / Hard Rock`); undefined when nothing remains
    - expect: Skip hits with `IsCancelled` or `IsPostponed` true (0 currently) instead of creating events
  11. Filter, dedupe and write
    - expect: Keep events whose start date falls in the Wed-Sun window (see 2.1); compare `yyyy-MM-dd` strings
    - expect: Dedupe within the run on the canonical ticket URL - names alone are not unique-safe (two events share `2026-11-26`: `NEWY MUSIC MARKET` 3:00PM and `SLY WITHERS - TBH ALBUM TOUR` 8:00PM)
    - expect: Skip only when the lowercased `eventName` **and** the local `yyyy-MM-dd` both match an entry in `src/eventFiles/{city}/past-events.json`; a name-only check (as in `hamiltonStationHotel.spec.ts`) would suppress recurring annual events such as `THE HAMO XMAS SPECIAL` or `Taking Back Saturday: New Years Eve - Newcastle`
    - expect: Wrap each card in try/catch, `console.error` and continue; a card missing name or date is skipped, not fatal
    - expect: `await sanitizeAndWriteToStagingFile(events, "HamiltonStationHotel", config)` at the end

### 2. Additional Considerations

**Seed:** ``

#### 2.1. Date-Range Handling (THIS WEEK: Wednesday → Sunday)

**File:** `specs/hamilton-station-hotel-date-range.md`

**Steps:**
  1. Compute the current week window in Australia/Sydney
    - expect: `const now = DateTime.now().setZone("Australia/Sydney"); const monday = now.startOf("week");` (Luxon weeks start Monday)
    - expect: `windowStart = monday.plus({ days: 2 }).toFormat("yyyy-MM-dd")` (Wednesday 00:00); `windowEnd = monday.plus({ days: 6 }).toFormat("yyyy-MM-dd")` (Sunday 24:00)
    - expect: For a run on Sat 24 Oct 2026 this yields `2026-10-21` .. `2026-10-25`; the feed currently contributes only 2 events inside it - `HELL RIPS THE HAMO VOL. XVI` (Sat 24th, 7:30PM) and `FIN KEY | The Days EP Tour` (Sun 25th, 7:00PM)
    - expect: Compare calendar dates as `yyyy-MM-dd` strings; never compare instants (AEDT UTC+11 now, AEST UTC+10 from 4 Apr 2027)
    - expect: Keep a single-day event when `windowStart <= date <= windowEnd`; keep a multi-day event when `start <= windowEnd && end >= windowStart`
  2. Accept the feed's own past-event cut
    - expect: The widget drops a hit once `DateEndUnix || DateStartUnix` is before midnight in the venue timezone, so Wednesday/Thursday events are already absent when the scraper runs on Saturday - the week window can legitimately return fewer than 7 days of gigs
    - expect: The index also includes a loose 48-hour guard server-side; both are upstream behaviour and must not be re-implemented
    - expect: Events are date-ascending, so a run in a quiet week may need several "Show more" pages before reaching windowEnd - keep the load-more loop bounded (12 iterations) and stop once the last card is past the window
  3. Handle year inference and the New Year boundary
    - expect: `.date-year` present -> authoritative (`2027` on 10 cards, `Thu Mar 18th 2027` last)
    - expect: `.date-year` absent -> current Sydney year; if the resulting date is before `now.minus({ days: 1 })`, add a year
    - expect: A 31 Dec 2026 event (`Taking Back Saturday: New Years Eve - Newcastle`, 9:00PM) renders with **no** year span because the current year is 2026 - do not assume "no year means next year"
    - expect: A January 2027 event renders `Sun Jan 24th 2027`; stripping the year would place it in the past and wrongly discard it
  4. Cover the remaining structural edge cases
    - expect: Multi-day: currently 0 of 41 hits have `DateEnd`; if a card ever renders two `.date-part` elements, treat part 2 as the end date and set `eventEndTime` from it (or from `DateEnd`, converted from UTC)
    - expect: Midnight crossing: cards expose no end time at all, so there is nothing to roll over; if `DateEnd` is ever earlier than `DateStart` on the same day, add one day to the end
    - expect: Missing time: no current card is missing `.time`; if one is, keep the event with `eventDateTime` at local midnight and `eventStartTime` undefined
    - expect: Same-day double headers (e.g. 26 Nov 2026, 3:00PM and 8:00PM) must both survive - dedupe on ticket URL / name+date, never on name alone
    - expect: Do not include events outside the window even though the feed lists them to Mar 2027; the staging file is a weekly window, not a full-season import

#### 2.2. Error Handling, Performance and Dedupe

**File:** `specs/hamilton-station-hotel-errors.md`

**Steps:**
  1. Keep the repo's network-abort pattern
    - expect: `page.route("**/*", ...)` aborting `image`, `font`, `media`, `png`, `jpeg`, `gif` (exact pattern from `hamiltonStationHotel.spec.ts` / `thelassComAu.spec.ts`); card `img[src]` attributes remain in the DOM, so banners still extract
    - expect: Optionally also abort `google-analytics.com`, `googletagmanager.com`, `sentry.io`, `connect.facebook.net` and the `open.spotify.com` embed to cut page weight; never abort `cdn.jsdelivr.net` (algoliasearch) or `icgfyqwgtd-dsn.algolia.net` - the widget depends on both
    - expect: Keep the `content-length` accumulator and `Downloaded X MB` log for run-size visibility
  2. Navigate defensively
    - expect: `waitUntil: "domcontentloaded"` then `await page.locator("article.hit").first().waitFor({ timeout: 20000 })` - the list is JS-rendered by Algolia, so `domcontentloaded` alone is not enough and there is no server-side card markup to fall back on
    - expect: Retry the whole navigation once on failure/timeout (pattern from `thelassComAu.spec.ts`), then throw a clear error if still empty
    - expect: Treat an empty `article.hit` list after 20s as a hard failure (widget blocked/renamed), not as "no events this week" - the empty-state template exists but a zero-card page in the middle of a run usually means JS/Algolia failed
  3. Expand pages safely
    - expect: Before each click check `isVisible()` and `isEnabled()` on `button.ais-InfiniteHits-loadMore`; wrap the click in `.catch()` because the button can disappear mid-click
    - expect: Detect progress by comparing `locator("article.hit").count()` before/after with a 1000-1500 ms settle; exit after two consecutive no-growth rounds (guard against the observer/button racing)
    - expect: Cap at 12 iterations (~41 events today, 7 pages); log the final count and the `nbHits`-equivalent when the Algolia payload is being captured
  4. Isolate per-event failures
    - expect: One `try/catch` per raw card inside the mapping loop; log `Error processing event card <name>` and continue
    - expect: Skip cards with no `.event-name`, no parsable date or no href, but keep the rest of the run
    - expect: Never let a single unparsable `.date-text` throw the whole scrape - return undefined stage-by-stage and log the raw strings
  5. Dedupe
    - expect: Within the run: `Set` of canonical ticket URLs (`https://tickets.oztix.com.au/outlet/event/{guid}`); also guard on `name.toLowerCase() + "|" + yyyy-MM-dd` (protects against duplicated cards if a page is loaded twice by the observer)
    - expect: Against history: `src/eventFiles/newcastle/past-events.json` (569 entries, city-wide and multi-venue at time of writing) - match only when both lowercased name and local date agree, because the file contains other venues' events and annually recurring Hamo events
    - expect: Skip events whose name matches the sanitizer's blocklist vocabulary (`trivia`, `comedy`, `markets`, `karaoke`, `bingo`, ...) is handled downstream by `sanitizeAndWriteToStagingFile` - do not duplicate that logic in the scraper
  6. Write and stay polite
    - expect: `await sanitizeAndWriteToStagingFile(events, "HamiltonStationHotel", config)` - `sanitizeEvents` will strip `"`, `<`, `>` and SQL keywords from description text, so pass already-cleaned plain text
    - expect: `mapTicketCost` reduces `From $16.85` to `16.85` and drops anything containing `free`; that is expected downstream behaviour
    - expect: One page load + at most ~7 clicks per run; no direct hammering of Algolia beyond a single `hitsPerPage: 100` request; keep ~1s between clicks, run once per day per city, no parallel runs for the same venue
    - expect: Honour `robots.txt` (it allows `/music`, disallows `/search` and `/config`) and keep a normal browser user agent - the file explicitly blocks AI-crawler UAs

#### 2.3. Source Field Mapping (ScrapedEvent)

| ScrapedEvent field | Source / selector | Transformation |
| --- | --- | --- |
| `id` | none | `randomUUID()` from `crypto` |
| `eventName` | `article.hit .event-name` textContent (fallback `article.hit .event-picture img[alt]`) | trim + collapse whitespace; keep casing/punctuation exactly as served |
| `upVotes` | none | not set by the scraper (sanitizer assigns a random 0-20) |
| `eventDateTime` | `.date-part` (`day-short` + `month-short` + ordinal + optional `date-year`) and `.time` | parse `yyyy-MM-dd h:mma` in `Australia/Sydney`, then `.toUTC().toISO()` -> `2026-10-24T08:30:00.000Z`; date-only midnight if `.time` missing |
| `lngLat` | Algolia hit `_geoloc` (fallback constant) | `[lng, lat]` = `[151.7491912841797, -32.91740036010742]`; fixed single-venue value |
| `localTimeZone` | constant | `"Australia/Sydney"` |
| `genres` | Algolia `Categories[]` | drop `Music`, `Australian Artists`, `Free Event`; join remainder with `", "`; `undefined` in DOM-only mode |
| `eventDescription` | Algolia `EventDescription` (HTML) | `<br>`/`</p>` -> `\n`, strip tags, decode entities, collapse whitespace; `undefined` when empty |
| `eventBannerImage` | `article.hit .event-picture img[src]` | force `https:`, keep rendition query but set `width=1200&height=600&format=webp&quality=80`; do **not** strip query (original is a 10.5 MB PNG); fallback `#logoImage img` with `?format=` removed |
| `eventLink` | `article.hit > a[href]` | canonicalise and strip `utm_*`/`fbclid`/`igshid` -> `https://tickets.oztix.com.au/outlet/event/{guid}`; no venue-hosted detail page exists, so this is the only per-event URL (existing code used the `/music` listing URL, which is not unique) |
| `eventPromoters` | none | `undefined` - `Special Guests:`/`.special-guests` are support acts, not a promoter; no promoter field on page or in payload |
| `createdAt` | none | `undefined` |
| `updatedAt` | none | `undefined` |
| `venueName` | constant (matches Algolia `Venue.Name`) | `"The Hamilton Station Hotel"` |
| `venueLink` | constant | `"https://www.thehamiltonstationhotel.com"` |
| `socialLink` | Organization JSON-LD `sameAs[0]` | `"https://www.facebook.com/TheHamiltonStationHotel/"` |
| `venueAddress` | constant (Algolia `Venue.Address/Locality/State/Postcode`) | `"2-6 Beaumont Street, Islington, NSW 2296, Australia"` (site JSON-LD says "6 Beaumont Street"; keep the Oztix value) |
| `venueLocation` | none (room retired) | `"Newcastle, NSW, Australia"`; `Front Bar`/`Band Room` no longer published anywhere - `undefined` would also be defensible but loses the city |
| `ticketCost` | `.free-event-badge` -> `"Free Entry"`; else Algolia `PriceFrom` | `"Free Entry"` on badge; `"From $<PriceFrom>"` only when `PriceFrom > 0`; `undefined` otherwise (`PriceFrom: 0` is not proof of a free event) |
| `ticketLink` | `article.hit > a[href]` | strip tracking params -> `https://tickets.oztix.com.au/outlet/event/{guid}`; absolute, single anchor per card |
| `eventStartTime` | same date + `.time` as `eventDateTime` | `.toISO()` in `Australia/Sydney` -> `2026-10-24T19:30:00.000+11:00`; `undefined` when no time |
| `eventEndTime` | second `.date-part` / Algolia `DateEnd` | `undefined` for all 41 current single-day events; when present, local ISO (UTC `DateEnd` converted to `Australia/Sydney`) with +1 day if the end precedes the start |
| `source` | constant | `"hamilton_station_hotel"` |
| `userEmail` | none | `undefined` |
| `userName` | none | `undefined` |
| `bandCampMediaIds` | none | `undefined` |
