# The Lass O'Gowrie What's On Scraping Plan

## Application Overview

Scraping plan for extracting music events from https://thelass.com.au/whatson - the "What's On" gig guide of The Lass O'Gowrie hotel, a live music pub at 14 Railway St, Wickham NSW 2293 (Newcastle, Australia). The site is built on Squarespace and the events page is a standard Squarespace "stacked events list": every event is rendered server-side as an `<article class="eventlist-event">` element inside two containers - `.eventlist.eventlist--upcoming` (events from today forward) and `.eventlist.eventlist--past` (older events). There is no pagination, no infinite scroll, no tabs and no AJAX/JSON API (the only network call on load is a `/api/census/RecordHit` tracking POST) - all ~48 events are present in the initial HTML. The full event detail (name, dates, start/end times, description, banner image, ticket links, free-event status) is available directly on the listing page, so visiting individual detail pages (`/whatson/{slug}`) is optional and adds no new fields (only "Back to All Events", prev/next event nav, and an explicit end date/time for multi-day events, which is also derivable from the listing markup).

## Test Scenarios

### 1. Extraction Plan

**Seed:** ``

#### 1.1. Page Structure Analysis

**File:** `specs/thelass-com-au-analyzer.md`

**Steps:**
  1. Navigate to https://thelass.com.au/whatson
    - expect: Page loads with title 'What's On — The Lass O'Gowrie'
    - expect: H1 heading 'What's happening at the lass? check our gig guide and event list below.' is visible
    - expect: No login wall or CAPTCHA; static HTML content is present immediately
  2. Identify all event card elements
    - expect: Each event is an `<article class="eventlist-event eventlist-event--upcoming|past ...">` (Squarespace standard markup)
    - expect: Upcoming events are wrapped in `<div class="eventlist eventlist--upcoming">`, past events in `<div class="eventlist eventlist--past">`, both inside `.sqs-events-collection-list.events.events-list.events-stacked`
    - expect: Multi-day events carry the extra class `eventlist-event--multiday`
    - expect: ~18 upcoming + ~30 past events on the page (count will vary over time)
  3. Analyze internal structure of each event article
    - expect: `a.eventlist-column-thumbnail` link wraps the banner `<img>` (alt text = event name, `data-src`/`src` = banner image URL)
    - expect: `.eventlist-column-date` contains the visual date tag: `.eventlist-datetag-startdate--month` ("July"), `.eventlist-datetag-startdate--day` ("31"), plus `.eventlist-datetag-enddate` ("to 2 Aug") for multi-day events, and an empty `.eventlist-datetag-status` element (reserved for status labels)
    - expect: `.eventlist-column-info` contains:
      - `h1.eventlist-title > a.eventlist-title-link` - event name + relative link to `/whatson/{slug}`
      - `ul.eventlist-meta` with `li.eventlist-meta-date` (machine-readable `time.event-date[datetime="YYYY-MM-DD"]`) and `li.eventlist-meta-time` (`.event-time-localized-start` / `.event-time-localized-end`, or for multi-day events two inline `span.eventlist-meta-time > time.event-time-localized` inside the date `li`)
      - `li.eventlist-meta-export` with Google Calendar + ICS (`?format=ical`) export links
      - `div.eventlist-description` - full description HTML (free-event notice, lineup, ticket CTA links to yourkind.io / events.humanitix.com / eventbrite.com.au)
      - `a.eventlist-button` "View Event →" link (same href as title link)
  4. Verify no pagination or dynamic loading
    - expect: No 'Older'/'Newer' links, no `?page=` URLs, no load-more buttons anywhere
    - expect: Network tab shows only the `/api/census/RecordHit` tracking POST plus static assets; no XHR/fetch JSON endpoints for events
    - expect: `https://thelass.com.au/whatson?format=ical` returns the HTML page (not a usable feed) - do not rely on iCal
  5. Open an event detail page (e.g. /whatson/beddy-rays)
    - expect: Detail page repeats the same fields as the listing card (title, dates, times, description, ticket links)
    - expect: Multi-day detail shows explicit end date + time ("Saturday 1 August 2026, 7:30 pm – Sunday 2 August 2026, 2:30 pm")
    - expect: Adds only "← Back to All Events" link and Previous/Next event cards - no venue/room/promoter/price fields beyond the listing
    - expect: Google Calendar export `dates=` param can disagree with displayed local times (observed: displayed 5:00 pm vs 09:00Z export) - never use it as the time source

#### 1.2. Field Extraction Patterns

**File:** `specs/thelass-com-au-extraction.md`

**Steps:**
  1. Extract the event date from `li.eventlist-meta-date time.event-date[datetime]`
    - expect: `datetime` attribute is ISO `YYYY-MM-DD` (e.g. `2026-07-31`) - authoritative for filtering; use it, never the display text
    - expect: Display text formats: single-day 'Friday 31 July 2026'; multi-day 'Sat, 1 Aug 2026' + 'Sun, 2 Aug 2026'
    - expect: Multi-day events have TWO `time.event-date` elements - first = start date, second = end date
    - expect: `eventDateTime` = `new Date(\`${dateAttr}T00:00:00+10:00\`).toISOString()` (AEST = UTC+10 for Jul/Aug; compute offset from `Australia/Sydney` via `Intl.DateTimeFormat` to be safe)
  2. Extract start/end times
    - expect: Single-day: `time.event-time-localized-start` and `time.event-time-localized-end` text ('5:00 pm', '11:15 pm')
    - expect: Multi-day: first `span.eventlist-meta-time time.event-time-localized` = start ('7:30 pm'), second = end ('2:30 pm'); end date comes from the second `time.event-date`
    - expect: Time formats: 'H:mm am/pm' and 'H am/pm' ('12:00 am', '3:00 am' seen for late-night events). Regex: `/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i`
    - expect: Where end time lacks an end date (single-day event ending after midnight, e.g. '5:00 pm – 3:00 am'), the end time belongs to the next day; set `eventEndTime` from the parsed time only and let `eventStartTime`/`eventDateTime` carry the date, or normalize end date = start date + 1 day when end < start
  3. Extract event name and links from the title
    - expect: `eventName` = text of `h1.eventlist-title a.eventlist-title-link` (trimmed)
    - expect: `eventLink` = absolute URL `https://thelass.com.au` + `a.eventlist-title-link[href]` (relative)
    - expect: `id` = `randomUUID()`; `source` = `'thelass_com_au'` (repo convention: snake-case domain, cf. `newcastle_live`)
  4. Extract the banner image
    - expect: `a.eventlist-column-thumbnail img` - prefer `data-src` (original resolution from `images.squarespace-cdn.com`), fallback `src`; `alt` = event name (useful sanity check / fallback name)
    - expect: Some cards have no image at all (e.g. SEATBELT COLLECTIVE PRESENTS) - leave `eventBannerImage` undefined in that case
  5. Extract description and ticket data from `.eventlist-description`
    - expect: `eventDescription` = trimmed `innerText` of `.eventlist-description` (includes 'This is a FREE event', lineup lists, ticket CTAs)
    - expect: `ticketLink` = href of first external ticket anchor: `a[href*="yourkind.io"], a[href*="humanitix.com"], a[href*="eventbrite"], a[href*="oztix"]` inside `.eventlist-description`; strip `utm_*`/`fbclid` query params
    - expect: `ticketCost` = 'Free Entry' when description contains 'This is a FREE event' (case-insensitive); else scan description for price patterns like `$15`, `$25 AT THE DOOR`, `$XX+bf`; fallback: leave undefined if no pattern found
    - expect: No ticket anchor present for some events (e.g. ALEX IRELAND JAZZ) - `ticketLink` undefined; 'DETAILS COMING SOON. WATCH THIS SPACE 🚀' cards have no description, times or ticket - skip filling those fields
  6. Set venue fields (constant - single venue site)
    - expect: `venueName` = 'The Lass O'Gowrie' (from header/footer branding)
    - expect: `venueAddress` = '14 Railway St, Wickham NSW 2293' (from footer `contentinfo`)
    - expect: `venueLocation` = 'Newcastle, NSW, Australia'; `localTimeZone` = 'Australia/Sydney'
    - expect: `venueLink` = 'https://thelass.com.au'; `socialLink` = 'https://www.facebook.com/Lassogowrie' (from footer nav)
  7. Extract promoter info (unstructured)
    - expect: No dedicated promoter field exists; when description contains 'presents:' or 'with:' followed by a promoter/collective name (e.g. 'Seatbelt collective are hosting...', 'Powder Your Nose & AFTERHOURS are back'), optionally capture `eventPromoters` via regex on `.eventlist-description` text - otherwise undefined
  8. Iterate all events and filter to the date window
    - expect: Query `page.locator('article.eventlist-event')` and evaluate each card in-place (no navigation required)
    - expect: Filter on the start date `datetime` attribute (and end date for multi-day) parsed as `YYYY-MM-DD` local dates; drop events outside the window (see section 2 for the window algorithm)
    - expect: The scraper must scan BOTH `.eventlist--upcoming` and `.eventlist--past` sections - for a window containing past dates (e.g. running on Sunday, events from the week's Wed/Thu/Fri have moved to the past section)
    - expect: Dedupe within the run by `eventLink`; skip events whose `eventName` matches (case-insensitive) entries in `src/eventFiles/newcastle/past-events.json` (pattern from `newcastleLive.spec.ts`)
    - expect: Wrap each event's extraction in try/catch; on failure log and continue with the next card (partial data extraction is acceptable - not every event has every field)

### 2. Additional Considerations (filters, pagination, edge cases)

#### 2.1. Date-Range Handling (THIS WEEK: Wednesday → Sunday, computed relative to "now")

  - Compute the current week's Monday in the local timezone: `const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));`
  - `windowStart` = Monday 00:00 + 2 days (Wednesday); `windowEnd` = Monday 00:00 + 6 days (Sunday 24:00).
  - For a run on Fri 31 Jul 2026 this yields Wed 29 Jul 2026 → Sun 2 Aug 2026 (inclusive), i.e. the requirement window. Never hardcode the dates.
  - Keep an event when: single-day → `startDate` is in `[windowStart, windowEnd]`; multi-day → `startDate <= windowEnd && endDate >= windowStart` (overlap test, e.g. BEDDY RAYS Sat 1 Aug – Sun 2 Aug qualifies).
  - Compare calendar dates only (string compare of `YYYY-MM-DD` works and avoids DST issues; Jul/Aug 2026 is AEST/UTC+10 with no DST transitions).
  - Expected events for the reference window (Fri 31 Jul 2026 run): HIGH PASS (Fri 31 Jul, 5:00 pm – 11:15 pm), BEDDY RAYS (Sat 1 Aug 7:30 pm – Sun 2 Aug 2:30 pm), ALEX IRELAND JAZZ (Sun 2 Aug, 3:00 pm – 5:00 pm). No events exist on Wed 29 / Thu 30 Jul.

#### 2.2. Edge Cases

  - **Multi-day events**: end date/time explicitly present in the meta markup (second `time.event-date` + second `event-time-localized`); `eventDateTime` uses the start date. Dates like "to 2 Aug" in the visual date tag are display-only - ignore for logic.
  - **Midnight-crossing shows**: end times '12:00 am' / '3:00 am' on the following calendar day (SUBSONIC: Sat 8 Aug 7:30 pm → Sun 9 Aug 3:00 am). The multi-day meta structure already carries the correct end date.
  - **Free events**: 'This is a FREE event' paragraph → `ticketCost: 'Free Entry'`, no ticket link.
  - **Ticket providers**: yourkind.io (most), events.humanitix.com, eventbrite.com.au - all handled by the same ticket-anchor selector; do not treat the booking.resdiary.com "Book a Table" header link as a ticket link (scope the selector to `.eventlist-description`).
  - **Placeholder events**: 'DETAILS COMING SOON. WATCH THIS SPACE 🚀' - no times, no image, no ticket; fill only name/date/link.
  - **Sold out / status**: `.eventlist-datetag-status` is present but empty in current data; if it gains text ('SOLD OUT' etc.) prepend it to `ticketCost` or log it - no scraping breakage either way.
  - **No pagination / rate limiting**: single page load; no polite-delay concerns beyond standard behaviour. Abort image/font/media requests in `beforeEach` (pattern from `newcastleLive.spec.ts`) to keep the run light.
  - **Selector resilience**: rely on Squarespace's stable `eventlist-*` class names (used site-wide by the platform); the listing page URL and both section containers are stable. Fallbacks: `article:has(h1.eventlist-title)` for the card, `img[alt]` inside the thumbnail for the name if the title link text is empty, and `time.event-date` display text as a last-resort date source (it is human-readable but parseable: 'Friday 31 July 2026' / 'Sat, 1 Aug 2026').
