import { DateTime } from "luxon";
import { randomUUID } from "crypto";
import { Page } from "playwright";
import { ScrapedEvent } from "./types";
import { sanitizeAndWriteToStagingFile } from "../helpers/sanitizeAndWriteToStaging";
import { test } from "./fixtures";

const LISTING_URL = "https://stagandhunter.com.au/upcoming-shows1";
const LOCAL_TIME_ZONE = "Australia/Sydney";

// Fixed single-venue values. Coordinates come from the site's own /contact map
// block (markerLat -32.8973499 / markerLng 151.73673), NOT from the payload
// _geoloc which is ~4.8 km off.
const VENUE_NAME = "The Stag & Hunter Hotel";
const VENUE_LINK = "https://stagandhunter.com.au";
const SOCIAL_LINK = "https://www.facebook.com/stagandhunter/";
const VENUE_ADDRESS = "187 Maitland Road, Mayfield NSW 2304, Australia";
const VENUE_LOCATION = "Newcastle, NSW, Australia";
const VENUE_LNG_LAT = [151.73673, -32.8973499]; // [lng, lat]

const SOURCE = "stag_and_hunter";

// The gig guide is the older/simpler Oztix Algolia InstantSearch v1 widget:
// a single hits list with hitsPerPage: 100, so all cards render in one pass and
// there is no pagination, load-more button or infinite scroll.
const CARD_SELECTOR = "#event-guide-hits article.hit";

// Fallbacks only - the values are read from the inline widget script so a key
// rotation does not silently break the run.
const ALGOLIA_APP_ID = "ICGFYQWGTD";
const ALGOLIA_API_KEY = "473fe164190fd2e1ccdf6c58fbfea884";
const ALGOLIA_INDEX = "prod_stag_and_hunter_eventguide";
const HITS_PER_PAGE = 100;

const MONTHS: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Sept: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

const WEEKDAYS: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Thur: 4,
  Thurs: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

// Facets that are not genres
const NON_GENRE_CATEGORIES = new Set(["music", "australian artists", "free event"]);

type RawCard = {
  eventName?: string;
  href: string | null;
  bannerSrc: string | null;
  day?: string;
  date?: string;
  month?: string;
};

// Subset of the Algolia hit used by this scraper. The index is venue-scoped and
// the secured search key is baked into the widget, so no filter params are needed.
type AlgoliaHit = {
  EventGuid?: string;
  EventName?: string;
  EventUrl?: string;
  EventImage1?: string;
  Categories?: string[];
  EventDescription?: string;
  DateStart?: string;
  DateStartUnix?: number;
  DateEnd?: string | null;
  DateEndUnix?: number;
  ExpirationDate?: string | null;
  PriceFrom?: number | null;
  IsCancelled?: boolean;
  IsPostponed?: boolean;
  Venue?: { Name?: string; Timezone?: string };
};

type AlgoliaQueryResponse = {
  results?: Array<{
    nbHits?: number;
    nbPages?: number;
    hits?: AlgoliaHit[];
  }>;
};

type MergedRecord = {
  card?: RawCard;
  hit?: AlgoliaHit;
  guid?: string;
};

type YearCursor = {
  year: number;
  previousMonth: number | undefined;
};

let totalBytes = 0;

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const request = route.request();
    const type = request.resourceType();
    const url = request.url();

    // Analytics, pixels and third-party embeds are pure overhead for a scrape
    const isNoise =
      /google-analytics\.com|googletagmanager\.com|\/g\/collect|connect\.facebook\.net|mailerlite\.com|use\.typekit\.net|youtube(?:-nocookie)?\.com|open\.spotify\.com|performance\.squarespace\.com|sentry\.io/.test(
        url,
      );

    // The widget needs these hosts: instantsearch.js (jsdelivr), moment +
    // moment-timezone (oztix.com.au/js) and the Algolia API.
    const isRequiredForWidget = /cdn\.jsdelivr\.net|oztix\.com\.au\/js\/|algolia\.net/.test(url);

    // Images/fonts/media are never needed: banner <img src> attributes stay in
    // the DOM and the rendition URL is rewritten below.
    const isBlockedType = ["image", "font", "media", "png", "jpeg", "gif"].includes(type);

    if (isBlockedType || (!isRequiredForWidget && isNoise)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  page.on("response", async (response) => {
    const headers = response.headers();
    const length = headers["content-length"];
    if (length) {
      totalBytes += Number(length);
    }
  });
});

test.afterEach(() => {
  console.log(`Downloaded ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
});

const collapseWhitespace = (value?: string | null): string | undefined => {
  const collapsed = value?.replace(/\s+/g, " ").trim();
  return collapsed || undefined;
};

// Strip tracking params, leaving https://stagandhunter.oztix.com.au/outlet/event/{guid}
const canonicaliseTicketUrl = (href: string | null | undefined, baseUrl: string): string | undefined => {
  if (!href) return undefined;
  try {
    const url = new URL(href, baseUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "fbclid" || key === "igshid") {
        url.searchParams.delete(key);
      }
    }
    return url.href;
  } catch {
    return undefined;
  }
};

const guidFromTicketUrl = (ticketUrl?: string): string | undefined => {
  const match = ticketUrl?.match(/\/outlet\/event\/([0-9a-f-]{36})/i);
  return match ? match[1].toLowerCase() : undefined;
};

// Keep the Oztix rendition query and rewrite it to banner size. The
// unparameterised original is a 535 KB PNG, so the query must never be stripped.
const toBannerUrl = (src: string | null | undefined, baseUrl: string): string | undefined => {
  if (!src) return undefined;
  try {
    const url = new URL(src, baseUrl);
    url.protocol = "https:";
    url.searchParams.set("width", "1200");
    url.searchParams.set("height", "600");
    url.searchParams.set("format", "webp");
    url.searchParams.set("quality", "80");
    return url.href;
  } catch {
    return undefined;
  }
};

// Emergency fallback only: the site logo (protocol-relative, Squarespace rendition param)
const toLogoUrl = (src: string | null | undefined, baseUrl: string): string | undefined => {
  if (!src) return undefined;
  try {
    const url = new URL(src, baseUrl);
    url.protocol = "https:";
    url.searchParams.delete("format");
    return url.href;
  } catch {
    return undefined;
  }
};

const lookupKey = (value?: string): string | undefined => {
  const trimmed = value?.trim().replace(/\.$/, "");
  if (!trimmed) return undefined;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

const cleanDescription = (html?: string | null): string | undefined => {
  if (!html) return undefined;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
};

const deriveGenres = (categories?: string[]): string | undefined => {
  const trimmed = (categories ?? []).map((category) => category.trim()).filter(Boolean);
  const genreOnly = trimmed.filter((category) => !NON_GENRE_CATEGORIES.has(category.toLowerCase()));
  // Casing is mixed on purpose ('POP', 'Blues', 'Alt Country') - keep as served
  return genreOnly.length ? genreOnly.join(", ") : undefined;
};

const normaliseNameForCompare = (value?: string): string | undefined =>
  value?.toLowerCase().replace(/[^a-z0-9]+/g, "") || undefined;

const readAlgoliaConfig = async (
  page: Page,
): Promise<{ appId: string; apiKey: string; indexName: string }> => {
  try {
    const inlineConfig = await page.evaluate(() =>
      Array.from(document.querySelectorAll("script"))
        .map((script) => script.textContent ?? "")
        .join("\n"),
    );

    const appId = inlineConfig.match(/appId:\s*['"]([A-Z0-9]+)['"]/);
    const apiKey = inlineConfig.match(/apiKey:\s*['"]([a-f0-9]+)['"]/);
    const indexName = inlineConfig.match(/indexName:\s*['"]([^'"]+)['"]/);

    if (!appId || !apiKey || !indexName) {
      console.warn("Could not read the inline Algolia widget config, using the hardcoded fallback");
      return { appId: ALGOLIA_APP_ID, apiKey: ALGOLIA_API_KEY, indexName: ALGOLIA_INDEX };
    }

    return { appId: appId[1], apiKey: apiKey[1], indexName: indexName[1] };
  } catch (error) {
    console.warn("Could not read the inline Algolia widget config, using the hardcoded fallback", error);
    return { appId: ALGOLIA_APP_ID, apiKey: ALGOLIA_API_KEY, indexName: ALGOLIA_INDEX };
  }
};

const indexHits = (hits: AlgoliaHit[]): Map<string, AlgoliaHit> => {
  const hitsByGuid = new Map<string, AlgoliaHit>();
  for (const hit of hits) {
    const guid = (hit.EventGuid ?? guidFromTicketUrl(hit.EventUrl))?.toLowerCase();
    if (guid) hitsByGuid.set(guid, hit);
  }
  return hitsByGuid;
};

// One (usually) hitsPerPage:100 request against the same secured key the widget
// uses, paging only if the index has grown past the cap. Any failure degrades to
// the widget's own captured response, then to DOM-only fields.
const fetchAlgoliaHits = async (
  page: Page,
  getCapturedHits: () => AlgoliaHit[] | undefined,
): Promise<Map<string, AlgoliaHit>> => {
  const config = await readAlgoliaConfig(page);
  const url = `https://${config.appId.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`;

  try {
    const collected: AlgoliaHit[] = [];
    let pageIndex = 0;
    let nbPages = 1;

    do {
      const response = await page.request.post(url, {
        headers: {
          "content-type": "application/json",
          "x-algolia-application-id": config.appId,
          "x-algolia-api-key": config.apiKey,
        },
        data: {
          requests: [
            {
              indexName: config.indexName,
              params: `query=&hitsPerPage=${HITS_PER_PAGE}&page=${pageIndex}`,
            },
          ],
        },
        timeout: 20000,
      });

      if (!response.ok()) {
        throw new Error(`Algolia responded with ${response.status()}`);
      }

      const body = (await response.json()) as AlgoliaQueryResponse;
      const result = body.results?.[0];
      const hits = result?.hits ?? [];

      collected.push(...hits);
      nbPages = typeof result?.nbPages === "number" ? result.nbPages : 1;

      if (!hits.length) break;
      pageIndex += 1;
    } while (pageIndex < nbPages);

    // Guard against a key being re-pointed at a shared/other-venue index
    const otherVenueHits = collected.filter((hit) => hit.Venue?.Name && hit.Venue.Name !== VENUE_NAME);
    if (otherVenueHits.length) {
      console.warn(
        `Algolia payload contained ${otherVenueHits.length} hits for other venues (${[
          ...new Set(otherVenueHits.map((hit) => hit.Venue?.Name)),
        ].join(", ")}) - ignoring them`,
      );
    }

    const venueHits = collected.filter((hit) => !hit.Venue?.Name || hit.Venue.Name === VENUE_NAME);
    if (!venueHits.length) {
      console.warn(`Algolia payload had no hits for ${VENUE_NAME} - continuing with DOM-only fields`);
      return indexHits(getCapturedHits() ?? []);
    }

    console.log(`Algolia payload: ${venueHits.length} hits (${nbPages} page(s))`);
    return indexHits(venueHits);
  } catch (error) {
    console.warn("Algolia enrichment unavailable, continuing with DOM-only fields", error);
    const captured = getCapturedHits();
    if (captured?.length) console.log(`Using ${captured.length} hits captured from the widget request`);
    return indexHits(captured ?? []);
  }
};

// DOM-only fallback: cards render no year at all, so walk the date-ascending
// list and roll the year forward whenever the month index decreases.
const resolveCardDate = (
  card: RawCard,
  now: DateTime,
  cursor: YearCursor,
): DateTime | undefined => {
  const dayMatch = card.date?.match(/^(\d{1,2})$/);
  const day = dayMatch ? Number(dayMatch[1]) : undefined;
  const monthKey = lookupKey(card.month);
  const month = monthKey ? MONTHS[monthKey] : undefined;

  if (!day || !month) {
    console.warn("Could not parse date from card", JSON.stringify(card));
    return undefined;
  }

  let year = cursor.year;
  if (cursor.previousMonth !== undefined && month < cursor.previousMonth) {
    year += 1;
  }

  let parsed = DateTime.fromObject({ year, month, day }, { zone: LOCAL_TIME_ZONE });
  if (!parsed.isValid) {
    // Out-of-range day for the inferred year (e.g. 29 Feb in a non-leap year)
    year += 1;
    parsed = DateTime.fromObject({ year, month, day }, { zone: LOCAL_TIME_ZONE });
  }

  if (!parsed.isValid) {
    console.warn("Invalid date built from card", JSON.stringify(card));
    return undefined;
  }

  // New Year guard: the feed is future-only, so a date just behind "now" is next year
  if (parsed < now.minus({ days: 1 })) {
    year += 1;
    parsed = DateTime.fromObject({ year, month, day }, { zone: LOCAL_TIME_ZONE });
  }

  cursor.year = year;
  cursor.previousMonth = month;

  return parsed.isValid ? parsed : undefined;
};

// DateStart/DateStartUnix are UTC without an offset: convert to venue wall-clock,
// never parse them as Sydney time.
const resolveHitStart = (
  hit?: AlgoliaHit,
): { local: DateTime; hasTime: boolean } | undefined => {
  if (!hit) return undefined;

  if (typeof hit.DateStartUnix === "number" && hit.DateStartUnix > 0) {
    return {
      local: DateTime.fromSeconds(hit.DateStartUnix, { zone: "utc" }).setZone(LOCAL_TIME_ZONE),
      hasTime: true,
    };
  }

  if (hit.DateStart) {
    const hasTime = /T\d{2}:\d{2}/.test(hit.DateStart);
    const parsed = hasTime
      ? DateTime.fromISO(hit.DateStart, { zone: "utc" }).setZone(LOCAL_TIME_ZONE)
      : DateTime.fromISO(hit.DateStart, { zone: LOCAL_TIME_ZONE });

    if (parsed.isValid) return { local: parsed, hasTime };
  }

  return undefined;
};

const resolveHitEnd = (hit: AlgoliaHit | undefined, start?: DateTime): DateTime | undefined => {
  if (!hit) return undefined;

  let parsed: DateTime | undefined;
  if (typeof hit.DateEndUnix === "number" && hit.DateEndUnix > 0) {
    parsed = DateTime.fromSeconds(hit.DateEndUnix, { zone: "utc" }).setZone(LOCAL_TIME_ZONE);
  } else if (hit.DateEnd) {
    const end = DateTime.fromISO(hit.DateEnd, { zone: "utc" });
    parsed = end.isValid ? end.setZone(LOCAL_TIME_ZONE) : undefined;
  }

  if (!parsed?.isValid) return undefined;

  // Midnight-crossing guard: an end before the start belongs to the next day
  if (start && parsed <= start) parsed = parsed.plus({ days: 1 });

  return parsed;
};

const isCancelledName = (eventName: string): boolean =>
  /^\s*cancell?ed\b/i.test(eventName) || /^\s*post[- ]?poned\b/i.test(eventName);

test("ScrapeStagAndHunter", async ({ page, config }) => {
  const { city, eventFiles } = config;
  let events: ScrapedEvent[] = [];

  console.log("Scraping The Stag & Hunter Hotel upcoming shows for", city);

  // Window: this week Wednesday 00:00 -> Sunday 24:00 in Australia/Sydney.
  // Compare calendar-date strings, never instants (AEDT/AEST boundary).
  const now = DateTime.now().setZone(LOCAL_TIME_ZONE);
  const monday = now.startOf("week");
  const windowStart = monday.plus({ days: 2 }).toFormat("yyyy-MM-dd");
  const windowEnd = monday.plus({ days: 6 }).toFormat("yyyy-MM-dd");
  console.log(`Event window ${windowStart}..${windowEnd} (${LOCAL_TIME_ZONE})`);

  // The widget's own Algolia request is captured as a fallback source in case the
  // direct POST is blocked. Installed before navigation on purpose.
  let capturedPayloadHits: AlgoliaHit[] | undefined;
  page.on("response", (response) => {
    void (async () => {
      if (capturedPayloadHits) return;
      if (!/\/1\/indexes\/[^/]*\/queries/.test(response.url())) return;

      try {
        if (!response.ok()) return;
        const body = (await response.json()) as AlgoliaQueryResponse;
        const hits = body.results?.[0]?.hits;
        if (hits?.length) {
          capturedPayloadHits = hits;
          console.log(`Captured ${hits.length} Algolia hits from the widget request`);
        }
      } catch {
        // The body can be discarded if the page navigates again
      }
    })();
  });

  // Retry once: the cards are rendered client-side by InstantSearch, so
  // domcontentloaded alone is not enough and there is no server-side fallback.
  let navigated = false;
  for (let attempt = 0; attempt < 2 && !navigated; attempt++) {
    try {
      await page.goto(LISTING_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("domcontentloaded");
      await page.locator(CARD_SELECTOR).first().waitFor({ timeout: 20000 });
      navigated = true;
    } catch (error) {
      console.warn(`Navigation attempt ${attempt + 1} failed, retrying...`, error);
      await page.waitForTimeout(2000);
    }
  }

  if (!navigated) {
    throw new Error(`Could not load the gig guide at ${LISTING_URL} - the Oztix widget did not render`);
  }

  // All cards are rendered in one pass, so this count is final (no load-more loop)
  const cardCount = await page.locator(CARD_SELECTOR).count();
  console.log(`Found ${cardCount} event cards in the gig guide`);
  if (cardCount === 0) {
    throw new Error(`No event cards found at ${LISTING_URL} - the Oztix widget may have changed`);
  }

  const hitsByGuid = await fetchAlgoliaHits(page, () => capturedPayloadHits);

  // Emergency-only logo fallback; every card currently carries its own banner
  let logoBanner: string | undefined;
  try {
    const logoSrc = await page.locator("#logoImage img").first().getAttribute("src", { timeout: 5000 });
    logoBanner = toLogoUrl(logoSrc, page.url());
  } catch {
    logoBanner = undefined;
  }

  const rawCards: RawCard[] = await page.locator(CARD_SELECTOR).evaluateAll((cards) =>
    cards.map((card) => {
      const anchor = card.querySelector<HTMLAnchorElement>("a[href]");
      const image = card.querySelector<HTMLImageElement>(".product-picture img[src]");
      // The date is rendered twice per card (mobile + desktop); scope to the
      // desktop container or bare .date/.month queries return the duplicate too.
      const dateContainer = card.querySelector(".product-date-container");

      return {
        eventName:
          card.querySelector(".product-name")?.textContent?.replace(/\s+/g, " ").trim() || undefined,
        href: anchor?.getAttribute("href") ?? null,
        bannerSrc: image?.getAttribute("src") ?? null,
        day: dateContainer?.querySelector(".day")?.textContent?.trim() || undefined,
        date: dateContainer?.querySelector(".date")?.textContent?.trim() || undefined,
        month: dateContainer?.querySelector(".month")?.textContent?.trim() || undefined,
      };
    }),
  );

  // Join DOM cards to payload hits 1:1 on the GUID in the Oztix URL, then keep
  // any payload-only records (the API is authoritative if the DOM is partial).
  const merged: MergedRecord[] = [];
  const seenGuids = new Set<string>();

  for (const card of rawCards) {
    const guid = guidFromTicketUrl(canonicaliseTicketUrl(card.href, LISTING_URL));
    if (guid) seenGuids.add(guid);
    merged.push({ card, guid, hit: guid ? hitsByGuid.get(guid) : undefined });
  }

  for (const [guid, hit] of hitsByGuid) {
    if (!seenGuids.has(guid)) merged.push({ hit, guid });
  }

  const seenTicketUrls = new Set<string>();
  const seenNameDates = new Set<string>();
  const yearCursor: YearCursor = { year: now.year, previousMonth: undefined };

  // History is city-wide and this scraper dedupes on name only (repo convention)
  const pastNames = new Set(
    eventFiles.past
      .map((past) => past.eventName?.trim().toLowerCase())
      .filter((name): name is string => Boolean(name)),
  );
  const pastNormalisedNames = new Set(
    eventFiles.past
      .map((past) => normaliseNameForCompare(past.eventName))
      .filter((name): name is string => Boolean(name)),
  );

  let inWindow = 0;
  let skippedCancelled = 0;

  for (const record of merged) {
    const { card, hit } = record;

    try {
      const eventName = collapseWhitespace(hit?.EventName) ?? collapseWhitespace(card?.eventName);
      if (!eventName) {
        console.warn("Skipping record with no event name", record.guid);
        continue;
      }

      // Two signals are needed: IsCancelled/IsPostponed is false on at least one
      // record whose name starts with CANCELLED, and true on plain-named records.
      if (hit?.IsCancelled || hit?.IsPostponed || isCancelledName(eventName)) {
        console.log(`Skipping cancelled/postponed event ${eventName}`);
        skippedCancelled += 1;
        continue;
      }

      const ticketLink =
        canonicaliseTicketUrl(hit?.EventUrl, LISTING_URL) ??
        canonicaliseTicketUrl(card?.href, LISTING_URL);
      if (!ticketLink) {
        console.warn(`Skipping ${eventName}: no parsable ticket link`);
        continue;
      }

      // Parsed for every non-cancelled card so the DOM-only year walk stays ordered
      const domDate = card ? resolveCardDate(card, now, yearCursor) : undefined;
      const payloadStart = resolveHitStart(hit);
      const start = payloadStart ?? (domDate ? { local: domDate, hasTime: false } : undefined);

      if (!start) {
        console.warn(
          `Skipping ${eventName}: no parsable start date (DateStart=${hit?.DateStart ?? "none"}, DateStartUnix=${hit?.DateStartUnix ?? "none"})`,
        );
        continue;
      }

      if (payloadStart && domDate) {
        const payloadKey = payloadStart.local.toFormat("yyyy-MM-dd");
        const domKey = domDate.toFormat("yyyy-MM-dd");
        if (payloadKey !== domKey) {
          console.warn(
            `Date mismatch for ${eventName}: card reads ${domKey}, payload converts to ${payloadKey} (payload wins)`,
          );
        }

        const cardWeekday = WEEKDAYS[lookupKey(card?.day) ?? ""];
        if (cardWeekday && cardWeekday !== payloadStart.local.weekday) {
          console.warn(
            `Weekday mismatch for ${eventName}: card says ${card?.day}, payload converts to ${payloadStart.local.toFormat("ccc")}`,
          );
        }

        // ExpirationDate is the same instant expressed in venue-local time
        if (payloadStart.hasTime && hit?.ExpirationDate) {
          const expiration = DateTime.fromISO(hit.ExpirationDate);
          if (
            expiration.isValid &&
            Math.abs(expiration.toMillis() - payloadStart.local.toMillis()) > 60_000
          ) {
            console.warn(
              `ExpirationDate ${hit.ExpirationDate} disagrees with converted start ${payloadStart.local.toISO()} for ${eventName}`,
            );
          }
        }
      }

      const startDateStr = start.local.toFormat("yyyy-MM-dd");
      const endLocal = resolveHitEnd(hit, start.local);
      const endDateStr = endLocal ? endLocal.toFormat("yyyy-MM-dd") : startDateStr;

      // Calendar-date comparison avoids DST edge cases. Multi-day records overlap
      // the window; single-day records must fall inside it. Never break early:
      // cancelled records sort last in this index.
      if (startDateStr > windowEnd || endDateStr < windowStart) {
        continue;
      }
      inWindow += 1;

      const nameDateKey = `${eventName.toLowerCase()}|${startDateStr}`;

      if (seenTicketUrls.has(ticketLink) || seenNameDates.has(nameDateKey)) {
        console.log("Already in list " + eventName);
        continue;
      }

      if (pastNames.has(eventName.toLowerCase())) {
        console.log("In past events " + eventName);
        continue;
      }

      // History stores this venue with different punctuation ("Merewether Fats
      // Blues Jam"), so log near-matches but do not drop recurring gigs.
      const normalisedName = normaliseNameForCompare(eventName);
      if (normalisedName && pastNormalisedNames.has(normalisedName)) {
        console.log(
          `Punctuation-insensitive match in past events (not skipped, different date): ${eventName}`,
        );
      }

      console.log(eventName, "start");

      const priceFrom = hit?.PriceFrom;
      const hasFreeSignal =
        /free\s*entry/i.test(eventName) ||
        (hit?.Categories ?? []).some((category) => category.trim().toLowerCase() === "free event");

      // PriceFrom 0/null is ambiguous (no price published), never proof of a free event
      const ticketCost = hasFreeSignal
        ? "Free Entry"
        : typeof priceFrom === "number" && priceFrom > 0
          ? `From $${priceFrom.toFixed(2)}`
          : undefined;

      const event: ScrapedEvent = {
        id: randomUUID(),
        eventName,
        eventDateTime: start.local.toUTC().toISO() ?? undefined,
        eventStartTime: start.hasTime ? start.local.toISO() ?? undefined : undefined,
        eventEndTime: endLocal?.toISO() ?? undefined,
        lngLat: VENUE_LNG_LAT,
        localTimeZone: LOCAL_TIME_ZONE,
        genres: deriveGenres(hit?.Categories),
        eventDescription: cleanDescription(hit?.EventDescription),
        eventBannerImage:
          toBannerUrl(hit?.EventImage1, LISTING_URL) ??
          toBannerUrl(card?.bannerSrc, page.url()) ??
          logoBanner,
        // There is no venue-hosted detail page, so the Oztix URL is the only per-event link
        eventLink: ticketLink,
        eventPromoters: undefined,
        venueName: VENUE_NAME,
        venueLink: VENUE_LINK,
        socialLink: SOCIAL_LINK,
        venueAddress: VENUE_ADDRESS,
        venueLocation: VENUE_LOCATION,
        ticketCost,
        ticketLink,
        source: SOURCE,
      };

      events = [...events, event];
      seenTicketUrls.add(ticketLink);
      seenNameDates.add(nameDateKey);

      console.log(
        `${eventName} end (${start.local.toFormat("ccc dd LLL yyyy HH:mm")} ${start.hasTime ? "" : "[date only]"})`.trim(),
      );
    } catch (error) {
      console.error(
        `Error processing event ${card?.eventName ?? hit?.EventName ?? record.guid ?? "unknown"}`,
        error,
      );
      continue;
    }
  }

  console.log(
    `Found ${rawCards.length} cards, ${hitsByGuid.size} hits, ${inWindow} in window, ${skippedCancelled} cancelled/postponed skipped, wrote ${events.length} events`,
  );

  await sanitizeAndWriteToStagingFile(events, "stag_and_hunter", config);
});
