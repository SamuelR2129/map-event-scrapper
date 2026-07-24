# Hamilton Station Hotel Gig Guide Scraping Plan

## Application Overview

Scraping plan for extracting upcoming music events from https://www.thehamiltonstationhotel.com/music - the gig guide page of Hamilton Station Hotel in Newcastle, Australia. The page lists upcoming events in a static HTML format with date headings, artist/band names, venue room, start time, ticket price, and ticket links. No pagination or AJAX loading - all events are rendered server-side in `<p>` elements within a Squarespace content block.

## Test Scenarios

### 1. Extraction Plan

**Seed:** ``

#### 1.1. Page Structure Analysis

**File:** `specs/hamilton-station-hotel-analyzer.md`

**Steps:**
  1. Navigate to https://www.thehamiltonstationhotel.com/music
    - expect: Page loads with title 'The Hamilton Station Hotel'
    - expect: GIG GUIDE heading is visible
  2. Identify all event paragraph elements in the main content area
    - expect: Each event is a <p> element inside a <div class='sqs-html-content'>
    - expect: All events are rendered server-side with no dynamic loading needed
  3. Analyze internal structure of each event <p>
    - expect: Each <p> contains a <strong> with the date (e.g., 'WEDNESDAY, JULY 15TH')
    - expect: Artist/band names appear as text nodes between <strong> and <em>
    - expect: One or more <em> elements contain venue info (room, time, price)
    - expect: Some events have <a> links to Oztix ticket pages
    - expect: Some events have <em> with promoter text like 'Destroy All Lines presents:'
  4. Verify no pagination or infinite scroll exists
    - expect: All events are in a single static page
    - expect: No 'Load More' or pagination controls found
    - expect: Scrolling to bottom does not load additional content

#### 1.2. Field Extraction Patterns

**File:** `specs/hamilton-station-hotel-extraction.md`

**Steps:**
  1. Extract date from <strong> element text
    - expect: Format: 'DAY, MONTH DATE' (e.g., 'WEDNESDAY, JULY 15TH')
    - expect: Strip ordinal suffix (TH/ST/ND/RD) for parsing
    - expect: Year is not specified - must infer from current context
  2. Extract artist/band names from text nodes
    - expect: Names are text between date <strong> and venue <em>
    - expect: Names separated by comma or ' + ' (plus sign)
    - expect: Some events have promoter prefix text that must be excluded
  3. Extract venue/room from last <em> element
    - expect: Format: '{Room} - {Time} Doors/Start - {Price/Status}'
    - expect: Room is either 'Front Bar' or 'Band Room'
    - expect: Time format: '{H}:{mm}pm' or '{H}pm' followed by 'Doors' or 'Start'
  4. Extract ticket price and link
    - expect: If <a> exists in <p>, href is the ticket link, text is the ticket cost
    - expect: If no <a>, ticket cost is in the last <em> text after the second ' - '
    - expect: Price patterns: '$XX+bf via Oztix', '$XX via Oztix', 'Free Entry', 'SOLD OUT!!!'
  5. Extract promoter information
    - expect: If first <em> contains 'presents:' or 'with:', it's promoter text
    - expect: Example: 'Destroy All Lines presents:' or 'FULL SEND FRIDAY with:'
