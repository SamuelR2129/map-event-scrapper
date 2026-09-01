# The Lass O'Gowrie What's On Scraping Plan

## Application Overview

Scraping plan for extracting music events from https://thelass.com.au/whatson - the "What's On" gig guide of The Lass O'Gowrie hotel, a live music pub at 14 Railway St, Wickham NSW 2293 (Newcastle, Australia). The site is built on Squarespace and the events page is a standard Squarespace "stacked events list": every event is rendered server-side as an <article class="eventlist-event"> inside two containers - .eventlist.eventlist--upcoming (events from today forward) and .eventlist.eventlist--past (older events). There is no pagination, infinite scroll, tabs or AJAX/JSON API (the only network call on load is a /api/census/RecordHit tracking POST) - all events (~43 observed: 13 upcoming + 30 past) are present in the initial HTML. The full event detail (name, dates, start/end times, description, banner image, ticket links, free-event status) is available directly on the listing page, so visiting individual detail pages (/whatson/{slug}) is optional. Detail pages additionally expose a schema.org Event JSON-LD with startDate/endDate (+0800 Squarespace offset) and an image array; per-event ?format=ical returns proper UTC iCal. The collection-level /whatson?format=ical returns HTML and is unusable. Venue fields/branding come from the site header/footer (address "14 Railway St, Wickham NSW 2293"); coordinates are fixed for the single venue: lngLat = [151.756027, -32.922325] (Apple Maps coordinate=-32.9223251,151.7560272). Local timezone is Australia/Sydney. The Google Calendar dates= UTC export and JSON-LD +0800 offsets both disagree with displayed Newcastle local wall-clock times and must not be used as the time source - always interpret displayed local times ("5:00 pm", "11:30 pm", "7:30 pm") in Australia/Sydney.

## Test Scenarios

### 1. Extraction Plan

**Seed:** ``

#### 1.1. Page Structure Analysis

**File:** `specs/thelass-com-au-analyzer.md`

**Steps:**
  1. Navigate to https://thelass.com.au/whatson
    - expect: Page loads with title 'What's On — The Lass O'Gowrie'
    - expect: H1 heading 'What's happening at the lass? check our gig guide and event list below.' is visible
    - expect: No login wall or CAPTCHA present; event HTML is available immediately after domcontentloaded
  2. Identify all event card elements
    - expect: Each event is an <article class='eventlist-event'> rendered server-side
    - expect: Upcoming cards carry class 'eventlist-event--upcoming'; older cards 'eventlist-event--past'
    - expect: Multi-day events carry the extra class 'eventlist-event--multiday'
    - expect: All cards sit inside .sqs-events-collection-list.events.events-list.events-stacked wrapped in div.eventlist.eventlist--upcoming and div.eventlist.eventlist--past
    - expect: Observed snapshot: 43 events - 13 upcoming + 30 past (count varies over time)
  3. Analyze the internal structure of each event article
    - expect: a.eventlist-column-thumbnail links to the detail page and wraps the banner img (alt = event name, data-src/src = image URL on images.squarespace-cdn.com)
    - expect: .eventlist-column-date holds the visual date tag: .eventlist-datetag-startdate--month ('Aug'), .eventlist-datetag-startdate--day ('28'), .eventlist-datetag-enddate ('to 30 Aug') for multi-day, empty .eventlist-datetag-status
    - expect: .eventlist-column-info contains h1.eventlist-title > a.eventlist-title-link (event name + relative /whatson/{slug} link)
    - expect: ul.eventlist-meta contains: li.eventlist-meta-date > time.event-date[datetime='YYYY-MM-DD'] (TWO for multi-day = start then end), li.eventlist-meta-time > span.event-time-localized > time.event-time-localized-start / time.event-time-localized-end (single-day only), li.eventlist-meta-export with Google Calendar + ICS (?format=ical) links
    - expect: div.eventlist-description holds description + ticket CTA anchors (yourkind.io, events.humanitix.com, eventbrite.com.au)
    - expect: a.eventlist-button 'View Event →' repeats the detail-page href
  4. Verify there is no pagination, infinite scroll or dynamic loading
    - expect: No 'Older'/'Newer' links, no '?page=' URLs, no load-more buttons anywhere
    - expect: Only network call is the /api/census/RecordHit tracking POST; event data is fully inside the initial HTML
    - expect: https://thelass.com.au/whatson?format=ical returns the HTML page (not a usable feed) - do not rely on collection-level iCal
  5. Open an event detail page (e.g. /whatson/hoelantis-powder-your-nose)
    - expect: Detail repeats the listing fields (title, dates, event description, ticket links)
    - expect: A script[type='application/ld+json'] with "@type":"Event" holds name, startDate/endDate (e.g. '2026-08-29T19:30:00+0800'), image[] and empty location
    - expect: Adds only '← Back to All Events', prev/next event cards and ICS link - no venue/price/promoter fields beyond the listing
    - expect: Google Calendar dates= UTC and JSON-LD +0800 offsets disagree with displayed Newcastle times (displayed '5:00 pm' exports as 09:00Z) - never use them as the time source
    - expect: Per-event ?format=ical returns proper iCal (VEVENT with UTC DTSTART/DTEND) - usable but not required

#### 1.2. Field Extraction Patterns

**File:** `specs/thelass-com-au-extraction.md`

**Steps:**
  1. Extract event name, detail link and id
    - expect: eventName = trimmed text of h1.eventlist-title a.eventlist-title-link
    - expect: eventLink = new URL(href, 'https://thelass.com.au').href
    - expect: id = randomUUID(); source = 'thelass_com_au' (repo snake_case convention, cf. newcastle_live)
  2. Extract event date from li.eventlist-meta-date time.event-date[datetime]
    - expect: datetime attribute is ISO 'YYYY-MM-DD' and is the authoritative date source (never use display text)
    - expect: Single-day: exactly one time.event-date; multi-day: FIRST = start date, SECOND = end date
    - expect: Start date feeds eventDateTime; end date feeds eventEndTime for multi-day events
  3. Extract start/end times (single-day events)
    - expect: Selectors: time.event-time-localized-start and time.event-time-localized-end, text format '5:00 pm', '11:30 pm', '12:00 am', '3:00 am', '7:30 pm'
    - expect: Both time elements carry datetime = the event start date
    - expect: Parse with luxon: DateTime.fromFormat(`${dateAttr} ${timeText}`, 'yyyy-MM-dd h:mm a', { zone: 'Australia/Sydney' }) with fallback format 'yyyy-MM-dd h a'
    - expect: eventStartTime = start ISO string; eventEndTime = end ISO string; localTimeZone = 'Australia/Sydney'
    - expect: If parsed end time-of-day < start time-of-day (5:00 pm -> 3:00 am) roll the end date forward one day before parsing end
    - expect: Never derive times from the Google Calendar dates= param (internal +0800 offset renders to '5:00 pm' as 09:00Z)
  4. Extract multi-day time backfill (optional)
    - expect: Multi-day cards expose NO time elements - only start+end dates in time.event-date
    - expect: Optional: visit the detail page and read JSON-LD startDate/endDate (e.g. '2026-08-29T19:30:00+0800'), take the wall-clock parts and interpret them in Australia/Sydney
    - expect: If detail page is not visited, leave eventStartTime/eventEndTime undefined; eventDateTime still uses the start date
    - expect: Per-event ?format=ical can substitute JSON-LD: DTSTART/DTEND are UTC but reverse-map to the same wall-clock when local is +10/+11
  5. Extract banner image
    - expect: a.eventlist-column-thumbnail img - prefer the data-src attribute (original resolution), fallback src
    - expect: Normalise to https and strip any ?format= params via URL API
    - expect: Some cards have no img element (e.g. SEATBELT COLLECTIVE PRESENTS) - leave eventBannerImage undefined
  6. Extract description, ticket cost and ticket link from .eventlist-description
    - expect: eventDescription = trimmed, whitespace-normalised innerText (includes 'This is a FREE event', lineup lists, ticket CTAs)
    - expect: ticketLink = href of the first anchor matching /yourkind\.io|humanitix\.com|eventbrite|oztix/i; strip utm_*/fbclid/igshid query params via the URL API
    - expect: ticketCost = 'Free Entry' when /this is a FREE event/i matches the description; else scan for /\$\s?\d+(?:\.\d{2})?/ optionally followed by '+bf' or 'AT THE DOOR'; leave undefined otherwise
    - expect: Scope ticket selectors to .eventlist-description - never capture the header 'Book a Table' booking.resdiary.com link
  7. Set constant venue fields (single-venue site)
    - expect: venueName = 'The Lass O'Gowrie' (header/footer branding)
    - expect: venueAddress = '14 Railway St, Wickham NSW 2293' (footer contentinfo)
    - expect: venueLocation = 'Newcastle, NSW, Australia'; localTimeZone = 'Australia/Sydney'
    - expect: venueLink = 'https://thelass.com.au'; socialLink = 'https://www.facebook.com/Lassogowrie'
    - expect: lngLat = [151.756027, -32.922325] (lng, lat) - fixed for the venue (Apple Maps coordinate=-32.9223251,151.7560272)
  8. Extract genres and promoters (unstructured)
    - expect: No category/tag meta exists anywhere - derive genres from description keywords case-insensitively: indie, rock, punk, jazz, techno, trance, house, 'drum and bass'/'dnb', 'hard dance', bass, afrobeats, amapiano, psych, soul, r&b, hip-hop, drag, bingo, comedy
    - expect: Join matches as a comma-separated genres string or leave undefined when nothing matches
    - expect: eventPromoters = regex /(presents|proudly presents|hosting)[\s:]+([A-Z][^,.;\n]+)/i on the description for named collectives (e.g. 'Seatbelt collective', 'BOX EVENTS', 'PyN x Afterhrs'); otherwise undefined
  9. Iterate every event card in place and filter the date window
    - expect: page.locator('article.eventlist-event') - get count, then loop nth(i).evaluate(...) to collect raw data; no navigation is required
    - expect: Scan BOTH .eventlist--upcoming and .eventlist--past wrappers - for a Wed-Sun window, weekday events earlier in the same week have already moved into the past section
    - expect: Filter to the week window (see Date-Range Handling); compare YYYY-MM-DD strings to avoid DST issues
    - expect: Dedupe within the run by eventLink; skip events whose eventName (case-insensitive) matches entries in src/eventFiles/{city}/past-events.json (pattern from newcastleLive.spec.ts)
    - expect: Wrap each card mapping in try/catch; log failures with console.error and continue - partial data extraction is acceptable

### 2. Additional Considerations

**Seed:** ``

#### 2.1. Date-Range Handling (THIS WEEK: Wednesday → Sunday)

**File:** `specs/thelass-com-au-date-range.md`

**Steps:**
  1. Compute the current week window in Australia/Sydney
    - expect: const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    - expect: windowStart = Monday 00:00 + 2 days (Wednesday 00:00); windowEnd = Monday 00:00 + 6 days (Sunday 24:00)
    - expect: For a run on Fri 28 Aug 2026 this yields Wed 26 Aug → Sun 30 Aug 2026 inclusive; never hardcode dates
    - expect: Keep single-day event when startDate is in [windowStart, windowEnd]; keep multi-day event when startDate <= windowEnd && endDate >= windowStart (overlap test)
    - expect: Compare calendar dates as YYYY-MM-DD strings - avoids DST edge cases (Aug/Sep 2026 is AEST UTC+10; DST begins Sun 4 Oct 2026)
  2. Handle known edge cases
    - expect: Multi-day events: no card times; end date = second time.event-date; eventDateTime uses the start date
    - expect: Midnight-crossing shows: end time earlier than start time ('5:00 pm' -> '3:00 am') requires end date +1 day before parsing end
    - expect: Free events: description contains 'This is a FREE event' → ticketCost = 'Free Entry', often no ticket link
    - expect: Placeholder events: 'DETAILS COMING SOON. WATCH THIS SPACE 🚀' - fill only name/date/link; leave other fields undefined
    - expect: Ticket providers: yourkind.io (majority), events.humanitix.com, eventbrite.com.au - all handled by the same ticket-anchor selector
    - expect: .eventlist-datetag-status is present but empty; if it ever gains text (e.g. 'SOLD OUT') prepend it to ticketCost or log it
    - expect: seatbelt-style events list a per-band time table inside the description - the scheduled first band start time approximates eventStartTime when no eventlist-meta-time exists
  3. Performance and error recovery
    - expect: beforeEach: route-abort image/font/media requests (repo pattern from newcastleLive.spec.ts)
    - expect: page.goto with waitUntil 'domcontentloaded', then wait for selector 'article.eventlist-event' (present immediately; no polling needed)
    - expect: Retry the navigation once on transient 503 responses (observed once on /contact)
    - expect: Per-card failures caught and logged; run continues to completion
  4. Run and write results
    - expect: Use the custom test fixture ({ page, config }) where config carries { city, eventFiles }
    - expect: After filtering, dedupe and mapping call sanitizeAndWriteToStagingFile(events, source='thelass_com_au', config)
    - expect: Log and continue on any per-event error - not every event has every field
