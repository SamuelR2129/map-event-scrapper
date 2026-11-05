# Stag & Hunter Hotel Upcoming Shows Scraping Plan

## Application Overview

Scraping plan for extracting gig-guide events from https://stagandhunter.com.au/upcoming-shows1 - the "Upcoming Shows" page of The Stag & Hunter Hotel, 187 Maitland Road, Mayfield NSW 2304 (Newcastle, Australia; Australia/Sydney, AEDT UTC+11 in November, AEST UTC+10 from 4 Apr 2027). The site is Squarespace (body class collection-upcoming-shows1) and the gig guide is the same Oztix "event guide" embed used by The Hamilton Station Hotel, but an older/simpler variant of the widget: the single .sqs-block-code holds an Algolia InstantSearch v1 hits list (not infiniteHits) with hitsPerPage: 100, so every event is rendered client-side in one pass and there is no pagination, load-more button, month tab, infinite scroll or URL state. Each event is div.ais-hits--item.event-container > article.hit with banner image, a date tag (day / DD / Mon), the event name, the venue line ("The Stag & Hunter Hotel") and the suburb ("Mayfield"). The card exposes NO start time, NO year, NO price, NO description and NO guests, and there is no venue-hosted detail page - every card is a single anchor that leaves the site for https://stagandhunter.oztix.com.au/outlet/event/{guid}?utm_source=StagAndHunter&utm_medium=Website. 29 cards were observed on 4 Nov 2026, exactly matching the Algolia nbHits, and a JS-disabled fetch of the raw HTML contains zero Oztix links, so the list is 100% client-rendered. The authoritative data source is the venue's own Algolia index prod_stag_and_hunter_eventguide (app ICGFYQWGTD, search key 473fe164190fd2e1ccdf6c58fbfea884) which the page itself queries on load: one POST to https://icgfyqwgtd-dsn.algolia.net/1/indexes/*/queries with params "query=&hitsPerPage=100&page=0" returns all 29 hits with EventName, DateStart + DateStartUnix (UTC), DateEnd/DateEndUnix, PriceFrom, MinPrice, Categories[], EventDescription (HTML), EventImage1, EventUrl, SpecialGuests, IsCancelled/IsPostponed, _geoloc and a full Venue object (Name/Address/Locality/State/Postcode/Timezone/WebsiteUrl). The index is venue-scoped and future-only (29 hits, earliest 2026-11-05, no past-dated records), so no venue filter or date filter is needed in the query. Source-of-truth warnings: DateStart is a UTC instant with no offset ("2026-11-05T08:30:00" = 19:30 AEDT; the Oztix ticket page renders it as "7:30pm" and its JSON-LD startDate is "2026-11-05T19:30:00+11:00") and must NEVER be read as Sydney wall-clock; the widget itself converts with moment.tz(DateStart,'UTC').tz(Venue.Timezone). There is no displayed time on the listing to disagree with, so the UTC->Sydney conversion is the single time source and ExpirationDate (e.g. "2026-11-05T19:30:00+11:00") is available as a corroborating cross-check. The index _geoloc (-32.863098144531, 151.70568847656) is ~4.8 km north-west of the pub and the repo's src/helpers/venueLocations.json entry for "Stag & Hunter" (209 Maitland Rd, -32.914069/151.739691) reverse-geocodes to Chatham Road, Hamilton North ~1.9 km south - both are wrong; use the site's own map block on /contact (markerLat -32.8973499, markerLng 151.73673), which reverse-geocodes in OSM to "Stag & Hunter Hotel, Hanbury Street, Mayfield NSW 2304".

## Test Scenarios

### 1. Extraction Plan

**Seed:** ``

#### 1.1. Page Structure Analysis

**File:** `specs/stag-and-hunter-analyzer.md`

**Steps:**
  1. Navigate to https://stagandhunter.com.au/upcoming-shows1
    - expect: document.title is exactly 'Upcoming Shows — The Stag and Hunter' (em dash)
    - expect: The only h1 is the logo heading (h1#logoImage wrapping img[alt='The Stag and Hunter']), so the heading has no text; the visible page title is h2 with text 'Upcoming Shows'
    - expect: No login wall, CAPTCHA, cookie/consent banner or interstitial overlay; document.body.innerText matches neither /cookie/i nor /consent/i
    - expect: Zero console errors and 6 benign warnings (5x 'yui: NOT loaded: squarespace-*' rollups plus one YouTube postMessage origin warning) - nothing that affects the event feed
    - expect: Header nav is Welcome / Sports Bar / Book Now / Eat / Drink / Live Music (hover: Upcoming Shows -> /upcoming-shows1, Get a Gig -> /get-a-gig) / Functions / 100 Years / TRIAL FEEDBACK (external jotform) / Contact
  2. Locate the event feed container
    - expect: There is exactly ONE .sqs-block-code on the page: .sqs-block.website-component-block.sqs-block-code.code-block (generated id block-yui_3_17_2_1_1550476093420_3991) > .sqs-block-content > .sqs-code-container > div.algolia-search > div.entries > div.container-fluid > .row > .col-md-9.event-wrap > .results-wrapper > main#event-guide-hits.clearfix
    - expect: main#event-guide-hits IS the InstantSearch hits container and also carries .ais-hits; every card is div.ais-hits--item.event-container > article.hit
    - expect: Every wrapper carries a generated Squarespace id (yui_3_17_2_1_...) - never use those ids, only the classes and #event-guide-hits above
    - expect: An input#eventsearchbar.ais-search-box--input (placeholder 'Search for Events') exists above the list - leave it empty; typing filters the result set
  3. Confirm the list is client-rendered and has NO pagination
    - expect: A plain (non-JS) fetch of the page contains ZERO stagandhunter.oztix.com.au links and only ONE literal 'article class="hit"', which lives inside the inline hitTemplate JS string - the cards do not exist server-side
    - expect: The inline widget is instantsearch.widgets.hits({ container: '#event-guide-hits', hitsPerPage: 100 }) - no infiniteHits, no pagination, no refinementList (all refinement/pagination widgets in the script are commented out)
    - expect: There is no load-more button, no month tab, no ?page= URL, no hash urlSync state and no infinite-scroll observer; the only <button> on the page is the newsletter Sign Up
    - expect: All 29 cards are in the DOM after the widget resolves: document.querySelectorAll('.ais-hits--item').length === 29 === Algolia nbHits
  4. Read the Algolia widget config from the inline script and record the backing request
    - expect: Inline script declares instantsearch({ appId: 'ICGFYQWGTD', apiKey: '473fe164190fd2e1ccdf6c58fbfea884', indexName: 'prod_stag_and_hunter_eventguide' })
    - expect: On load the page POSTs https://icgfyqwgtd-dsn.algolia.net/1/indexes/*/queries with body {"requests":[{"indexName":"prod_stag_and_hunter_eventguide","params":"query=&hitsPerPage=100&page=0&facets=%5B%5D&tagFilters="}]} and HTTP 200
    - expect: The widget depends on https://cdn.jsdelivr.net/instantsearch.js/1/instantsearch.min.js plus https://www.oztix.com.au/js/moment.min.js and moment-timezone-with-data.min.js - these must NEVER be route-aborted
    - expect: The same index answers a direct server-side POST (no Origin/Referer required) with hitsPerPage:100, so both response-capture and page.request.post work
  5. Inspect the anatomy of a card (e.g. the Merewether Fats' Blues Jam card)
    - expect: Whole card is article.hit > a.clearfix[href='https://stagandhunter.oztix.com.au/outlet/event/e8ce9111-...?utm_source=StagAndHunter&utm_medium=Website'] - exactly one anchor per card
    - expect: Banner: .product-picture-wrapper .product-picture img with src='https://assets.oztix.com.au/image/{uuid}.png?width=600&height=300' and alt = event name stripped to alphanumerics (e.g. MerewetherFatsBluesJam) - so alt is NOT a usable name fallback
    - expect: Name: .product-name (plain text, no ais-Highlight wrapper unless a search query is typed)
    - expect: Venue line: .product-type = 'The Stag & Hunter Hotel'; suburb: .product-city = 'Mayfield' (.product-city is hidden-xs but present in the DOM)
    - expect: Date is rendered TWICE per card - .event-date-mobile.visible-xs (inside the picture wrapper) and .product-date-container (desktop column) - hence 58 .date elements for 29 cards. Always scope to .product-date-container
    - expect: Date parts are span.day = 'Thu', span.date = '05' (zero-padded, no ordinal), span.month = 'Nov'; the template also computes DateStartPart.Year but DOES NOT render it - there is no year in the DOM
    - expect: The card contains no time, no price, no description, no support-act line, no room name and no end date
  6. Confirm there is no venue-hosted event detail page
    - expect: Every card href is absolute and on stagandhunter.oztix.com.au (0 relative hrefs); clicking opens the Oztix outlet page
    - expect: No /upcoming-shows1/{slug} route exists and there are no Squarespace events-collection items (article.eventlist-event count = 0) - the collection is collection-type-page, not an events collection
    - expect: The Oztix page https://stagandhunter.oztix.com.au/outlet/event/{guid} is the only per-event URL, so eventLink === ticketLink and there is no detail-page pass
  7. Record the Algolia hit shape and index behaviour
    - expect: Observed hit fields: EventId, EventGuid, EventName, MinPrice (always 0), PriceFrom (null | 0 | decimal), PriceBreakdown (null), EventImage1, HomepageImage, SpecialGuests, EventDescription (HTML <p>), DateStart (UTC, no offset), DateStartUnix (seconds, UTC), DateEnd (null), DateEndUnix (0), DateStartMonth/DateStartWeek/DateStartMonthName (UTC-derived), EventUrl, ShortEventUrl (oztix.link), Categories[], _geoloc{lat,lng}, Venue{Id,Name,Address,Locality,State,Postcode,PhoneNumber,WebsiteUrl,Timezone 'Australia/Sydney',Country}, Bands[], Performances[], TourName, FullCategories[], IsApproved, IsCancelled, IsPostponed, IsRescheduled, HasEventDatePassed, ExpirationDate, AvailabilityDate, LastModifiedUtc, objectID, _highlightResult
    - expect: The index is venue-scoped and future-only: 29 hits, all Venue.Name === 'The Stag & Hunter Hotel', earliest DateStart 2026-11-05, latest 2027-04-22, DateEnd null on all 29 (single-day only today)
    - expect: Sort is DateStart ascending EXCEPT IsCancelled:true records, which sort last: the 29th card is 'CANCELLED - Kyle Lionhart I'm Doing Fine Tour' dated 19 Nov 2026. Never break out of the loop early on date order
    - expect: Filters on non-faceted attributes silently return 0: filters='HasEventDatePassed:true' -> nbHits 0, filters='IsCancelled:true' -> nbHits 0. Always fetch everything and filter in JS
    - expect: One record is named 'CANCELLED - Summer Rain ...' while IsCancelled is FALSE, and one is IsCancelled true with a plain name - both signals must be checked
  8. Check the Oztix per-event page as a secondary structured source
    - expect: The ticket page embeds script[type="application/ld&#x2B;json"] - note the HTML-entity-encoded '+' in the MIME type, so script[type="application/ld+json"] does NOT match it
    - expect: Its @graph holds a Product (offers price, e.g. "price":"34.20", currency AUD) and an Event with startDate '2026-11-06T20:00:00+11:00', location.address.streetAddress '187 Maitland Rd' and location.geo.latitude/longitude null
    - expect: AEST events convert correctly too: DateStart '2027-04-22T10:00:00' -> startDate '2027-04-22T20:00:00+10:00' -> displayed '8:00 pm' (DST ends 4 Apr 2027)
    - expect: The page title reads '... Tickets at The Stag & Hunter Hotel (Mayfield, NSW) on Friday, 6 November 2026', confirming name, venue, suburb and year
    - expect: This corroborates the Algolia DateStart->Sydney conversion but requires 29 extra page loads, so it is validation/fallback only - the listing plus Algolia payload is the primary path
  9. Check the venue site's own structured data and fixed venue fields
    - expect: Exactly one script[type='application/ld+json'] on the page: {"@type":"WebSite","url":"https://stagandhunter.com.au","name":"The Stag and Hunter"} - NO Organization, LocalBusiness or Event JSON-LD anywhere on the site
    - expect: /contact contains a Squarespace map block whose data-context has addressTitle 'Stag and Hunter Hotel', markerLat -32.8973499, markerLng 151.73672999999997, mapZoom 12; a Nominatim reverse geocode of that point resolves to 'Stag & Hunter Hotel, Hanbury Street, Mayfield, NSW 2304'
    - expect: Footer (contentinfo) text: '187 Maitland Road / Mayfield NSW 2304 / 02 4968 1205 / enquiries@thestag.com.au'
    - expect: Footer social links: https://www.facebook.com/stagandhunter/ and a personal Spotify profile (https://open.spotify.com/user/21mtwlkfhunwrqehzdrmgbuhq, labelled 'John Citizen') - only the Facebook URL is a venue social link; the site's instagram links are post permalinks (/p/...), not a profile
    - expect: Oztix corroborates the address as '187 Maitland Rd, Mayfield NSW 2304' and the venue website as 'http://www.stagandhunter.com.au/'
  10. Note anti-scraping posture and politeness constraints
    - expect: No authentication, no CAPTCHA challenge, no rate limiting and no bot-wall observed across repeated loads; a Google reCAPTCHA Enterprise script is present site-wide but is not triggered by the feed
    - expect: robots.txt is the Squarespace default: allows /upcoming-shows1, disallows /config, /search, /account, /api/, /static/ and query-param views; it also names and blocks AI-crawler UAs (GPTBot, ClaudeBot, CCBot, Google-Extended, Amazonbot, anthropic-ai, ...) - use a normal browser profile with no AI UA override
    - expect: Page weight is dominated by third parties: a YouTube hero iframe, GA/GTM (three tags), Facebook pixel (two ids), MailerLite and Typekit - abort image/font/media plus those hosts, but never cdn.jsdelivr.net, www.oztix.com.au/js/* or icgfyqwgtd-dsn.algolia.net
    - expect: One page load plus (optionally) one Algolia POST per run is enough - there is no pagination to walk and no detail page to visit

#### 1.2. Field Extraction Patterns

**File:** `specs/stag-and-hunter-extraction.md`

**Steps:**
  1. Load the page and wait for the widget
    - expect: await page.goto(LISTING_URL, { waitUntil: 'domcontentloaded' }) then await page.locator('article.hit').first().waitFor({ timeout: 20000 }) - domcontentloaded alone is not enough because the cards are rendered by InstantSearch
    - expect: Retry the whole navigation once on failure/timeout (thelassComAu.spec.ts pattern) and throw a clear error if article.hit is still empty - a zero-card page means the widget/Algolia failed, not that the venue has no gigs
    - expect: No scrolling, clicking or load-more loop is required - the article.hit count is final at 29
  2. Fetch the Algolia payload (primary data source)
    - expect: Preferred: page.request.post('https://icgfyqwgtd-dsn.algolia.net/1/indexes/*/queries') with headers x-algolia-application-id: ICGFYQWGTD and x-algolia-api-key: 473fe164190fd2e1ccdf6c58fbfea884, body { requests: [{ indexName: 'prod_stag_and_hunter_eventguide', params: 'query=&hitsPerPage=100&page=0' }] } - verified HTTP 200 from Node with no Origin/Referer
    - expect: Prefer reading the credentials from the inline script with /appId:\s*'([A-Z0-9]+)'/, /apiKey:\s*'([a-f0-9]+)'/ and /indexName:\s*'([^']+)'/ so a key rotation does not silently break the run (hardcode as fallback)
    - expect: Read json.results[0].hits; there is exactly one result object. If nbHits > hits.length (index grew past the 100 cap) request page=1.. until page >= nbPages - 1
    - expect: Alternative: attach page.on('response') for /indexes\/\*\/queries/ BEFORE page.goto and read results[0].hits from the widget's own request
    - expect: Index each hit by lowercased EventGuid (== the GUID in EventUrl) so DOM cards and payload records join 1:1
    - expect: If the POST fails, fall back to DOM-only mode (next step) and log that time, price, description and genres are unavailable
  3. Map every card with ONE evaluateAll pass (fallback + join key)
    - expect: page.locator('#event-guide-hits article.hit').evaluateAll(cards => cards.map(card => ({ name: card.querySelector('.product-name')?.textContent, href: card.querySelector('a[href]')?.getAttribute('href'), img: card.querySelector('.product-picture img[src]')?.getAttribute('src'), day: card.querySelector('.product-date-container .day')?.textContent, date: card.querySelector('.product-date-container .date')?.textContent, month: card.querySelector('.product-date-container .month')?.textContent }))) - this exact selector set was executed against the live page and returned all 29 cards correctly
    - expect: Scope date reads to .product-date-container; a bare .date or .month query also returns the mobile duplicate (58 matches)
    - expect: Extract the GUID from the card href with /\/outlet\/event\/([0-9a-f-]{36})/i and join to the payload
    - expect: Never use img[alt] as the event name - it is the alphanumeric-stripped name (HollyWildDaniElRassiCoHeadline)
    - expect: Do not read .product-city as the venue name ('Mayfield'), and do not read card.innerText (it concatenates date + name + venue + suburb)
  4. Convert the date and time to Sydney wall-clock
    - expect: Prefer DateStartUnix (seconds, UTC): DateTime.fromSeconds(hit.DateStartUnix, { zone: 'utc' }).setZone('Australia/Sydney'); fall back to DateTime.fromISO(hit.DateStart, { zone: 'utc' }).setZone('Australia/Sydney') when DateStartUnix is missing or 0
    - expect: '2026-11-05T08:30:00' -> 2026-11-05T19:30:00+11:00 (AEDT) -> card reads 'Thu 05 Nov'; '2027-04-22T10:00:00' -> 20:00+10:00 (AEST) - both verified against the Oztix ticket page's rendered time and its JSON-LD startDate
    - expect: eventStartTime = local.toISO() (offset-bearing local ISO, e.g. 2026-11-05T19:30:00.000+11:00); eventDateTime = local.toUTC().toISO() (e.g. 2026-11-05T08:30:00.000Z)
    - expect: NEVER parse DateStart as Sydney wall-clock (that would place the blues jam at 08:30 and lose 11 hours); never use DateStartMonthName/DateStartMonth/DateStartWeek for the local date - they are UTC-derived
    - expect: Optional cross-check: ExpirationDate (2026-11-05T19:30:00+11:00) is the same instant expressed in venue-local time - warn if it disagrees with the converted value by more than a minute
    - expect: Optional consistency check: compare the converted Sydney 'ddd DD MMM' against the card's .day/.date/.month and log mismatches (payload authoritative, DOM is a hint)
    - expect: Missing time / date-only: leave eventStartTime undefined and set eventDateTime to local midnight via DateTime.fromISO(dateStr, { zone: 'Australia/Sydney' }).toUTC().toISO()
  5. Build the DOM-only fallback date (year and time are not rendered)
    - expect: There is no year in the card and no time at all - DOM-only mode must infer the year and leave eventStartTime undefined
    - expect: Year inference: start from the current Sydney year and roll forward whenever a card's month index is LOWER than the previous card's (the list is date-ascending apart from cancelled-last entries), plus the New Year guard if (parsed < now.minus({ days: 1 })) year += 1
    - expect: Months map Jan..Dec (3-letter, no trailing dot); .date is zero-padded DD with no ordinal suffix, so parse with /^(\d{1,2})$/
    - expect: Drop cancelled-last records before inferring years or they corrupt the month walk (they can sit out of order at the end of the list)
    - expect: Accept the loss of time/price/description in this mode rather than inventing values; log a loud warning that the Algolia payload was unavailable
  6. Extract eventName
    - expect: Primary: EventName from the payload; fallback: .product-name textContent
    - expect: Trim and collapse whitespace only; keep punctuation and unicode exactly as served (Merewether Fats' Blues Jam; 'Drugs in Sport w/  The PeeWee 50's & Nic Roser- FREE ENTRY' has a double space after w/ - collapse it)
    - expect: id = randomUUID(); source = 'stag_and_hunter' (repo snake_case convention, cf. hamilton_station_hotel, thelass_com_au, oz_tix)
  7. Extract description, genres and guests from the payload
    - expect: eventDescription = EventDescription with <br>/</p> -> newline, other tags stripped, entities decoded (&amp;, &#39;, &quot;, &nbsp;), whitespace collapsed; all 29 hits currently have a non-empty description
    - expect: genres = Categories[] minus the non-genre facets 'Music', 'Australian Artists' and 'Free Event' (reuse NON_GENRE_CATEGORIES from hamiltonStationHotel.spec.ts), joined with ', ' (e.g. 'Folk, Alt Country'); undefined when nothing remains or in DOM-only mode
    - expect: Categories casing is mixed on purpose ('POP', 'Blues', 'Alt Country') - keep as served, do not title-case
    - expect: SpecialGuests is a support-act line ('' on 28 hits, 'With Guests' on The Delines (USA)) - do NOT map it to eventPromoters or eventName
    - expect: eventPromoters is undefined: no promoter/presenter field exists in the card, the payload or the site JSON-LD; Bands[]/Performances[] are lineup data, not promoters
  8. Extract ticket cost and ticket links
    - expect: Free signal 1: /free\s*entry/i on EventName (4 hits: Roadshow, Drugs in Sport, Beefweek, Summer Rain) -> ticketCost = 'Free Entry'
    - expect: Free signal 2: Categories contains 'Free Event' -> 'Free Entry' (not present today; keep for safety)
    - expect: Paid: PriceFrom > 0 -> 'From $' + PriceFrom.toFixed(2) (observed 11.75, 17.35, 23.5, 28.6, 34.2, 39.3, 44.3, 44.4, 46.8, 50, 54.6); the Oztix page shows the same number as $34.20 for 34.2
    - expect: PriceFrom === 0 occurs for 'The Roadshow Ft Kingswood & Friends - FREE ENTRY' and PriceFrom === null for 'Merewether Fats' Blues Jam', 'Drugs in Sport ... FREE ENTRY' and 'The Australian Beefweek Show ... FREE ENTRY'; MinPrice is 0 on every hit and is therefore useless
    - expect: Never infer free from PriceFrom === 0, PriceFrom === null or MinPrice === 0 - the blues jam has a null price and no free marker, so its ticketCost stays undefined
    - expect: ticketLink = EventUrl canonicalised with new URL(), dropping every utm_*, fbclid and igshid param -> https://stagandhunter.oztix.com.au/outlet/event/{guid}
    - expect: eventLink = the same canonical URL (no venue detail page exists, so both fields are identical for this source)
  9. Extract the banner image
    - expect: Primary: EventImage1; fallback: .product-picture img[src]; both are https://assets.oztix.com.au/image/{uuid}.png?width=600&height=300
    - expect: Normalise with new URL(src, page.url()), force https:, then rewrite the rendition query to width=1200&height=600&format=webp&quality=80 -> verified 200 image/webp, 43 KB
    - expect: Keep the query string: the unparameterised original is a 535 KB PNG on this site (12x heavier)
    - expect: All 29 hits have an image; the emergency-only fallback is the site logo #logoImage img (//images.squarespace-cdn.com/...stg-header-logo-300-space.png?format=1500w, protocol-relative - force https and delete ?format=)
  10. Set the fixed single-venue fields
    - expect: venueName = 'The Stag & Hunter Hotel' (payload Venue.Name and DOM .product-type agree on all 29 hits)
    - expect: venueAddress = '187 Maitland Road, Mayfield NSW 2304, Australia' (payload Venue.Address '187 Maitland Rd', Locality 'Mayfield', State 'NSW', Postcode '2304'; site footer and Oztix JSON-LD agree)
    - expect: venueLink = 'https://stagandhunter.com.au' (payload Venue.WebsiteUrl is the http:// form; use https for the site link)
    - expect: socialLink = 'https://www.facebook.com/stagandhunter/' (footer social block; the Spotify profile in the same block is a personal account, not the venue)
    - expect: venueLocation = 'Newcastle, NSW, Australia' (repo convention - 25 past-events entries use this exact string; Mayfield is already carried in venueAddress)
    - expect: localTimeZone = 'Australia/Sydney' (Venue.Timezone on all 29 hits)
    - expect: lngLat = [151.73673, -32.8973499] ([lng, lat]) from the site's own /contact map block - do NOT use the payload _geoloc ([151.705688, -32.863098], ~4.8 km off) nor the stale src/helpers/venueLocations.json 'Stag & Hunter' entry ('209 Maitland Rd', [151.739691, -32.914069], ~1.9 km off, reverse-geocodes to Chatham Rd Hamilton North)
  11. Filter, dedupe and write
    - expect: Window filter on the Sydney calendar date (see 2.1); the multi-day overlap rule applies if DateEnd is ever populated
    - expect: Skip IsCancelled === true or IsPostponed === true records, and additionally skip any EventName matching /^cancelled\b/i (one hit is named CANCELLED while IsCancelled is false)
    - expect: Dedupe within the run by canonical event/ticket URL, and guard with eventName.toLowerCase() + '|' + yyyy-MM-dd (the blues jam repeats monthly with the same name and 6 different GUIDs)
    - expect: Skip when eventName.toLowerCase() matches an entry in config.eventFiles.past (name-only pattern from thelassComAu.spec.ts), noting that past-events.json stores this venue as 'Stag & Hunter' / 'The Stag & Hunter Hotel (Mayfield, NSW)' and holds 'Merewether Fats Blues Jam' without the apostrophe - see 2.2 for the optional punctuation-tolerant compare
    - expect: Wrap each event in try/catch, console.error and continue; a record without a name or parsable date is skipped, not fatal
    - expect: await sanitizeAndWriteToStagingFile(events, 'stag_and_hunter', config) at the end

### 2. Additional Considerations

**Seed:** ``

#### 2.1. Date-Range Handling (THIS WEEK: Wednesday -> Sunday)

**File:** `specs/stag-and-hunter-date-range.md`

**Steps:**
  1. Compute the current week window in Australia/Sydney
    - expect: const now = DateTime.now().setZone('Australia/Sydney'); const monday = now.startOf('week'); (Luxon weeks start Monday) - matches hamiltonStationHotel.spec.ts
    - expect: windowStart = monday.plus({ days: 2 }).toFormat('yyyy-MM-dd') (Wednesday 00:00); windowEnd = monday.plus({ days: 6 }).toFormat('yyyy-MM-dd') (Sunday 24:00)
    - expect: For a run on Wed 4 Nov 2026 this yields 2026-11-04 .. 2026-11-08; the feed contributes 3 cards inside it - Merewether Fats' Blues Jam (Thu 5, 19:30), Holly Wild & Dani El-Rassi - Co-Headline (Fri 6, 20:00) and CANCELLED - Summer Rain ... (Sat 7, 20:00, dropped) -> 2 written events
    - expect: Compare calendar dates as yyyy-MM-dd strings, never instants (AEDT UTC+11 until 4 Apr 2027, then AEST UTC+10)
    - expect: Single-day: keep when windowStart <= date <= windowEnd. Multi-day: keep when start <= windowEnd && end >= windowStart
  2. Handle the index's sort order and future-only cut
    - expect: The index only contains upcoming events (0 records with a past DateStart; earliest is 2026-11-05), so the feed never needs a past-event cut of its own
    - expect: Do NOT assume strict date ordering: IsCancelled:true records sort last, so 'CANCELLED - Kyle Lionhart' (19 Nov) is the final card after 22 Apr 2027. Iterate all 29 records and filter on the date - never break early
    - expect: A quiet week is legitimately possible (a Wednesday run with no Wed-Sun gigs yields 0 events) - distinguish that from a widget failure by requiring article.hit to have rendered first
  3. Cover the structural edge cases
    - expect: Year: taken from the payload (DateStartUnix -> Sydney year). The DOM renders no year at all, so never strip or guess it when the payload is available - the feed spans Nov 2026 to Apr 2027 and a stripped year would wrongly discard 2027 events
    - expect: New Year boundary: 31 Dec 2026 (none currently) and 7 Jan 2027 both convert cleanly; DOM-only mode must roll the year forward when the month index decreases
    - expect: Midnight crossing: no card or payload field exposes an end time today (DateEnd null on all 29), so eventEndTime stays undefined. If DateEnd/DateEndUnix is ever populated and the end precedes the start, add one day before converting
    - expect: Late shows: the venue trades to 2am, so a 21:00 start finishing 00:30 has no representation - do not synthesise an end time
    - expect: Multi-day/festival runs: DateEndUnix is 0 (not null) when absent - treat 0 and null as 'no end'
    - expect: Same-day double headers must both survive: dedupe on GUID/URL and name+date, never on name alone (the blues jam appears 6 times with the same name)
    - expect: Do not import the whole season - only Wed-Sun of the current week belongs in the staging file, even though the feed lists to Apr 2027

#### 2.2. Error Handling, Performance and Dedupe

**File:** `specs/stag-and-hunter-errors.md`

**Steps:**
  1. Keep the repo's network-abort pattern
    - expect: page.route('**/*', ...) aborting image, font, media, png, jpeg, gif (exact pattern from hamiltonStationHotel.spec.ts / thelassComAu.spec.ts); <img src> attributes survive in the DOM so banners still extract
    - expect: Additionally abort analytics/embeds to cut weight: google-analytics.com, googletagmanager.com, google.com/g/collect, connect.facebook.net, static.mailerlite.com, app.mailerlite.com, use.typekit.net, youtube.com / youtube-nocookie.com, open.spotify.com, performance.squarespace.com
    - expect: NEVER abort cdn.jsdelivr.net (instantsearch.js), www.oztix.com.au/js/* (moment + moment-timezone), assets.oztix.com.au or icgfyqwgtd-dsn.algolia.net - the widget needs all of them
    - expect: Keep the content-length accumulator and the 'Downloaded X MB' afterEach log for run-size visibility
  2. Navigate defensively
    - expect: waitUntil: 'domcontentloaded' then await page.locator('article.hit').first().waitFor({ timeout: 20000 }) - the raw HTML has no cards at all, so there is no server-side fallback
    - expect: Retry the navigation once (for attempt < 2) with a 2 s pause, then throw 'Could not load the gig guide at <url> - the Oztix widget did not render'
    - expect: Treat 0 cards after 20 s as a hard failure (script blocked / index renamed / template changed), not as an empty week
    - expect: The no-results template (.no-results) only renders when the search box filters everything out - if it appears on a bare load the index returned 0 hits
  3. Harden the Algolia enrichment
    - expect: Wrap the POST in try/catch, check response.ok() and results[0].hits?.length; any failure degrades to DOM-only mode with a loud warning rather than failing the run
    - expect: Cap the request at hitsPerPage: 100 (the widget's own value) and page through only if nbHits > hits.length
    - expect: Timeout the POST (~20 s) so a hung Algolia call cannot consume the whole 900 s Playwright budget
    - expect: Sanity-check the payload is this venue (results[0].hits.every(h => h.Venue?.Name === 'The Stag & Hunter Hotel')) and log/abort enrichment if it is not - protects against a key being re-pointed at a shared index
  4. Isolate per-event failures
    - expect: One try/catch per hit inside the mapping loop; console.error('Error processing event <name>', error) and continue
    - expect: Skip records with no EventName, no GUID/URL or no parsable DateStart; keep the rest of the run
    - expect: Never let one malformed date throw the whole scrape - return undefined stage by stage and log the raw DateStart / DateStartUnix values
    - expect: Log a summary line: 'Found N cards, M hits, K in window, wrote W events'
  5. Dedupe
    - expect: Within the run: a Set of canonical https://stagandhunter.oztix.com.au/outlet/event/{guid} URLs plus a Set of eventName.toLowerCase() + '|' + yyyy-MM-dd to absorb duplicate cards if the widget ever double-renders
    - expect: Against history: config.eventFiles.past (src/eventFiles/newcastle/past-events.json, 649 entries, city-wide multi-venue). Required rule is name-only: past.find(e => e.eventName?.toLowerCase() === eventName.toLowerCase())
    - expect: Known limitation to accept: history stores this venue's events under 'Stag & Hunter' / 'The Stag & Hunter Hotel (Mayfield, NSW)' with different name formatting ('Merewether Fats Blues Jam' vs "Merewether Fats' Blues Jam"), so a punctuation-tolerant secondary compare (name.toLowerCase().replace(/[^a-z0-9]+/g, '')) catches more repeats without false-matching other venues
    - expect: Do not dedupe on name alone inside the run - the monthly blues jam is 6 separate legitimate gigs
    - expect: Cancelled/postponed events are dropped before the dedupe counts, so history is not polluted
  6. Stay polite and respect robots
    - expect: One HTML load plus one Algolia POST per run; no detail pages, no pagination, no repeated polling
    - expect: Honour robots.txt (allows /upcoming-shows1; disallows /config, /search, /account, /api/) and keep the normal Playwright Desktop Chrome UA - the file explicitly blocks AI-crawler UAs
    - expect: Run once per week per city, never in parallel with itself (the pipeline already serialises with workers: 1)
    - expect: sanitizeEvents strips double quotes, < and > plus AND/OR/semicolon tokens from descriptions - pass already-cleaned plain text and expect that downstream lossy step
    - expect: mapTicketCost reduces 'From $34.20' to '34.20' and drops anything containing 'free' - so 'Free Entry' becomes undefined in the staging file by design; do not fight it
  7. Run and write results
    - expect: Use the custom fixture: test('ScrapeStagAndHunter', async ({ page, config }) => ...) where config carries { city, eventFiles } from src/scrappers/fixtures.ts
    - expect: await sanitizeAndWriteToStagingFile(events, 'stag_and_hunter', config) - sanitizeEvents + deleteOldEvents + merge into src/eventFiles/{city}/staging-events.json
    - expect: Run with npx playwright test src/scrappers/stagAndHunter.spec.ts --project=newcastle
    - expect: Expected on a 4 Nov 2026 run: 29 cards, 29 hits, 3 in window, 1 cancelled, 2 written
    - expect: console.log per event is the repo convention ('<name> start' / '<name> end') and makes the staging diff auditable

#### 2.3. Selector Table and Source Field Mapping

**File:** `specs/stag-and-hunter-field-map.md`

**Selector table**

| Purpose | Primary selector | Fallback | Notes |
| --- | --- | --- | --- |
| Page ready / wait | `#event-guide-hits article.hit` | `article.hit` | Client-rendered by InstantSearch; raw HTML has 0 cards |
| Event card | `#event-guide-hits .ais-hits--item.event-container > article.hit` | `article.hit` | 29 observed; all cards exist after first wait |
| Event name | `.product-name` | Algolia `EventName` | `img[alt]` is alphanumeric-stripped -> unusable |
| Date tag | `.product-date-container .day` / `.date` / `.month` | `.event-date-mobile .day` / `.date` / `.month` | Date rendered twice per card (58 `.date` nodes for 29 cards) |
| Venue line | `.product-type` | Algolia `Venue.Name` | Constant `The Stag & Hunter Hotel` |
| Suburb | `.product-city` | Algolia `Venue.Locality` | Constant `Mayfield` |
| Banner | `.product-picture img[src]` | Algolia `EventImage1`, then `#logoImage img` | Rewrite rendition query; never strip it |
| Card / ticket link | `article.hit a[href]` | Algolia `EventUrl` | Exactly one anchor per card |
| Search box (leave untouched) | `input#eventsearchbar` | `input.ais-search-box--input` | Typing filters the result set |
| Empty state | `.no-results` | - | Renders only when the query filters everything out |
| Site logo (emergency banner) | `#logoImage img` | - | Protocol-relative Squarespace CDN URL |
| Social link | footer `a[href*="facebook.com/stagandhunter"]` | - | Constant `https://www.facebook.com/stagandhunter/` |
| Venue coordinates (one-off) | `/contact` map block `data-context` (`markerLat` / `markerLng`) | OSM reverse geocode | Fixed `[151.73673, -32.8973499]`; do not re-derive per run |
| Algolia credentials (one-off) | inline `instantsearch({ appId, apiKey, indexName })` script | hardcoded constants below | Read defensively so key rotation degrades gracefully |
| Backing data (preferred) | `POST https://icgfyqwgtd-dsn.algolia.net/1/indexes/*/queries` | `page.on('response')` capture of the same call | `indexName: prod_stag_and_hunter_eventguide`, `hitsPerPage: 100` |

**Fixed constants**

```ts
const LISTING_URL = "https://stagandhunter.com.au/upcoming-shows1";
const LOCAL_TIME_ZONE = "Australia/Sydney";
const VENUE_NAME = "The Stag & Hunter Hotel";
const VENUE_LINK = "https://stagandhunter.com.au";
const SOCIAL_LINK = "https://www.facebook.com/stagandhunter/";
const VENUE_ADDRESS = "187 Maitland Road, Mayfield NSW 2304, Australia";
const VENUE_LOCATION = "Newcastle, NSW, Australia";
const VENUE_LNG_LAT = [151.73673, -32.8973499]; // [lng, lat]
const SOURCE = "stag_and_hunter";

const ALGOLIA_APP_ID = "ICGFYQWGTD";
const ALGOLIA_API_KEY = "473fe164190fd2e1ccdf6c58fbfea884";
const ALGOLIA_INDEX = "prod_stag_and_hunter_eventguide";
```

**Source field mapping (ScrapedEvent)**

| ScrapedEvent field | Source / selector | Transformation |
| --- | --- | --- |
| `id` | none | `randomUUID()` from `crypto` |
| `eventName` | Algolia `EventName` (fallback `.product-name` textContent) | Trim + collapse whitespace; keep casing/punctuation exactly as served |
| `upVotes` | none | Not set by the scraper (sanitizer assigns a random 0-20) |
| `eventDateTime` | `DateStartUnix` (fallback `DateStart`) -> UTC -> Sydney | `DateTime.fromSeconds(ts, { zone: 'utc' }).setZone('Australia/Sydney').toUTC().toISO()` -> `2026-11-05T08:30:00.000Z`; date-only local midnight when no time |
| `lngLat` | Site `/contact` map block (constant) | `[151.73673, -32.8973499]`; ignore Algolia `_geoloc` and the stale `venueLocations.json` entry |
| `localTimeZone` | constant (`Venue.Timezone`) | `"Australia/Sydney"` |
| `genres` | Algolia `Categories[]` | Drop `Music`, `Australian Artists`, `Free Event`; join with `", "`; `undefined` when nothing remains or DOM-only |
| `eventDescription` | Algolia `EventDescription` (HTML) | `<br>`/`</p>` -> `\n`, strip tags, decode entities, collapse whitespace; `undefined` when empty |
| `eventBannerImage` | Algolia `EventImage1` / `.product-picture img[src]` | Force `https:`, keep query but set `width=1200&height=600&format=webp&quality=80`; fallback `#logoImage img` with `?format=` removed |
| `eventLink` | Algolia `EventUrl` / card anchor | Strip `utm_*`/`fbclid`/`igshid` -> `https://stagandhunter.oztix.com.au/outlet/event/{guid}`; identical to `ticketLink` |
| `eventPromoters` | none | `undefined` - no promoter field on the page or in the payload; `SpecialGuests`/`Bands` are lineup data |
| `createdAt` | none | `undefined` |
| `updatedAt` | none | `undefined` |
| `venueName` | Algolia `Venue.Name` / `.product-type` | `"The Stag & Hunter Hotel"` |
| `venueLink` | `Venue.WebsiteUrl` / site header | `"https://stagandhunter.com.au"` |
| `socialLink` | Footer social block | `"https://www.facebook.com/stagandhunter/"` |
| `venueAddress` | `Venue.Address/Locality/State/Postcode` + footer | `"187 Maitland Road, Mayfield NSW 2304, Australia"` |
| `venueLocation` | none (constant) | `"Newcastle, NSW, Australia"` (repo convention; Mayfield lives in `venueAddress`) |
| `ticketCost` | `EventName` `/free\s*entry/i` or `Categories` has `Free Event`; else `PriceFrom > 0` | `"Free Entry"`; `"From $34.20"`; `undefined` for `PriceFrom` 0/null without a free signal |
| `ticketLink` | Algolia `EventUrl` / card anchor | Same canonical Oztix URL as `eventLink` |
| `eventStartTime` | Same instant as `eventDateTime` | `.toISO()` in `Australia/Sydney` -> `2026-11-05T19:30:00.000+11:00`; `undefined` when no time |
| `eventEndTime` | Algolia `DateEnd` / `DateEndUnix` (null/0 on all 29 today) | Local ISO; `+1 day` if the end precedes the start |
| `source` | constant | `"stag_and_hunter"` |
| `userEmail` | none | `undefined` |
| `userName` | none | `undefined` |
| `bandCampMediaIds` | none | `undefined` |

**Fields that will be missing for some or all events**

- `eventEndTime` - `DateEnd`/`DateEndUnix` are null/0 on every current record; no end time is published anywhere.
- `ticketCost` - free events carry no price at all, and free-ness is only implied by the name text for 4 of them.
- `eventPromoters` - never available.
- `genres`, `eventDescription` - unavailable in DOM-only fallback mode.
- `eventStartTime` - unavailable in DOM-only fallback mode (the card shows no time).

#### 2.4. Ordered Implementation Steps

**File:** `specs/stag-and-hunter-implementation.md`

1. Create `src/scrappers/stagAndHunter.spec.ts` importing `DateTime` from `luxon`, `randomUUID` from `crypto`, `ScrapedEvent` from `./types`, `sanitizeAndWriteToStagingFile` from `../helpers/sanitizeAndWriteToStaging` and `test` from `./fixtures`.
2. Declare the constants block from 2.3 (`LISTING_URL`, `LOCAL_TIME_ZONE`, the six venue constants, `SOURCE`, and the three Algolia constants).
3. `test.beforeEach`: install the `page.route("**/*")` abort for `image`/`font`/`media`/`png`/`jpeg`/`gif` plus the analytics/embed hosts listed in 2.2, and keep the `content-length` accumulator + `Downloaded X MB` `afterEach`.
4. Compute the Wed-Sun window with `DateTime.now().setZone(LOCAL_TIME_ZONE).startOf("week")` (`plus 2` / `plus 6` days) and log it.
5. Navigate with a 2-attempt loop: `goto(LISTING_URL, { waitUntil: "domcontentloaded" })` then `locator("article.hit").first().waitFor({ timeout: 20000 })`; throw a descriptive error if both attempts fail.
6. Read the Algolia config from the inline script (regex helpers) with the hardcoded constants as fallback, then `page.request.post` the `/*/queries` endpoint with `hitsPerPage: 100` inside try/catch(20 s timeout). On failure log a warning and continue in DOM-only mode.
7. Map all cards with one `evaluateAll` pass over `#event-guide-hits article.hit` (name, href, img src, `product-date-container` day/date/month).
8. Build `Map<guid, AlgoliaHit>` keyed on `EventGuid.toLowerCase()`; optionally attach a `page.on("response")` capture before `goto` as the alternate source.
9. Loop the merged records: resolve name/GUID, skip cancelled/postponed (`IsCancelled`, `IsPostponed`, or `/^cancelled\b/i` on the name), convert `DateStartUnix` -> Sydney, compute `dateStr`, apply the window + overlap filter.
10. Dedupe (canonical URL set + `name|date` set + `eventFiles.past` name check), map every remaining field per 2.3, and append to `events` inside a `try/catch`.
11. Log summary counts (`cards`, `hits`, `in window`, `written`) and any weekday/`ExpirationDate` mismatches.
12. `await sanitizeAndWriteToStagingFile(events, SOURCE, config)`.

#### 2.5. Run and Write Results

**File:** `specs/stag-and-hunter-run.md`

1. Use the shared fixture so history is available:
   - expect: `test("ScrapeStagAndHunter", async ({ page, config }) => { const { city, eventFiles } = config; ... })`
   - expect: `config.eventFiles.past` is `src/eventFiles/newcastle/past-events.json` (649 entries) and `city.cityName` is `newcastle`
2. Write the results:
   - expect: `await sanitizeAndWriteToStagingFile(events, "stag_and_hunter", config)` - `source` is snake_case, matching `hamilton_station_hotel`, `thelass_com_au` and `oz_tix`
   - expect: Output lands in `src/eventFiles/newcastle/staging-events.json`, merged with any existing staging entries; `deleteOldEvents` runs first
   - expect: `Free Entry` becomes `undefined` in the staging file because `mapTicketCost` drops anything containing "free" - this is expected, not a bug
3. Verify the run:
   - expect: `npx playwright test src/scrappers/stagAndHunter.spec.ts --project=newcastle`
   - expect: On a run dated Wed 4 Nov 2026: 29 cards -> 29 hits -> 3 in window -> 1 cancelled -> 2 events written (`Merewether Fats' Blues Jam` 2026-11-05T19:30+11:00 and `Holly Wild & Dani El-Rassi - Co-Headline` 2026-11-06T20:00+11:00)
   - expect: `eventDateTime` values land as `2026-11-05T08:30:00.000Z` and `2026-11-06T09:00:00.000Z` respectively, with `eventStartTime` `2026-11-05T19:30:00.000+11:00` and `2026-11-06T20:00:00.000+11:00`
   - expect: The run downloads far less than a full page load because images/fonts/media/analytics are aborted; a single HTML document plus one JSON response is the real cost
4. Things to re-verify when the scraper is generated (dynamic surface):
   - expect: `#event-guide-hits` and the `article.hit` / `.product-name` / `.product-date-container` class names are stable widget internals, but the Oztix embed is versioned (`instantsearch.js 1.12.1`) - re-check after any Squarespace/Oztix template change
   - expect: `.product-date-container` must stay the date scope; if Oztix later renders a year (`DateStartPart.Year`), prefer the payload anyway and keep the DOM as a cross-check only
   - expect: The Algolia API key may rotate; the inline-script regex is the guard, and a 403 from Algolia must degrade to DOM-only rather than abort the run
   - expect: The current index has 29 hits; the `hitsPerPage: 100` cap is fine today but the paging branch (step 6 of 1.2) must exist before the venue books >100 upcoming shows
