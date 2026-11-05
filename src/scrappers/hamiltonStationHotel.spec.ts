import { DateTime } from "luxon";
import { randomUUID } from "crypto";
import { Page } from "playwright";
import { ScrapedEvent } from "./types";
import { sanitizeAndWriteToStagingFile } from "../helpers/sanitizeAndWriteToStaging";
import { test } from "./fixtures";

const LISTING_URL = "https://www.thehamiltonstationhotel.com/music";
const LOCAL_TIME_ZONE = "Australia/Sydney";

const VENUE_NAME = "The Hamilton Station Hotel";
const VENUE_LINK = "https://www.thehamiltonstationhotel.com";
const SOCIAL_LINK = "https://www.facebook.com/TheHamiltonStationHotel/";
const VENUE_ADDRESS = "2-6 Beaumont Street, Islington, NSW 2296, Australia";
const VENUE_LOCATION = "Newcastle, NSW, Australia";
const VENUE_LNG_LAT = [151.7491912841797, -32.91740036010742];

const SOURCE = "hamilton_station_hotel";

// The gig guide is an Oztix Algolia InstantSearch widget: cards are client-rendered
// and expanded with a "Show more events" button plus an auto-scroll observer.
const CARD_SELECTOR = "article.hit";
const LOAD_MORE_SELECTOR = "button.ais-InfiniteHits-loadMore";
const MAX_LOAD_MORE_ITERATIONS = 12;
const LOAD_MORE_SETTLE_MS = 1200;

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

type RawDatePart = {
  dayShort?: string;
  monthShort?: string;
  dateText?: string;
  year?: string;
};

type RawEvent = {
  eventName?: string;
  imgAlt?: string;
  isFree: boolean;
  href: string | null;
  bannerSrc: string | null;
  dateParts: RawDatePart[];
  timeText: string | null;
};

// Subset of the Algolia hit used for enrichment. The venue restriction is baked
// into the secured search key, so every hit belongs to this venue.
type AlgoliaHit = {
  EventGuid?: string;
  EventUrl?: string;
  Categories?: string[];
  EventDescription?: string;
  DateEnd?: string | null;
  PriceFrom?: number;
  IsCancelled?: boolean;
  IsPostponed?: boolean;
  _geoloc?: { lat?: number; lng?: number };
};

let totalBytes = 0;

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const request = route.request();
    const type = request.resourceType();
    const url = request.url();

    // Never abort cdn.jsdelivr.net (algoliasearch) or the Algolia API - the widget needs both
    const isAnalytics = /google-analytics\.com|googletagmanager\.com|sentry\.io|connect\.facebook\.net|open\.spotify\.com/.test(
      url,
    );

    if (["image", "font", "media", "png", "jpeg", "gif"].includes(type) || isAnalytics) {
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

// Strip tracking params, leaving https://tickets.oztix.com.au/outlet/event/{guid}
const canonicaliseTicketUrl = (href: string | null, baseUrl: string): string | undefined => {
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

// Keep the Oztix rendition query and rewrite it to banner size. The unparameterised
// original is a ~10.5 MB PNG, so the query must never be stripped.
const toBannerUrl = (src: string | null, baseUrl: string): string | undefined => {
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
const toLogoUrl = (src: string | null, baseUrl: string): string | undefined => {
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

// Normalise "oct" / "Oct." to the lookup keys used above
const lookupKey = (value?: string): string | undefined => {
  const trimmed = value?.trim().replace(/\.$/, "");
  if (!trimmed) return undefined;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

// Cards render both spellings ("SaturdaySat OctoberOct 24th"), so only the short
// spans plus the ordinal text node are safe to parse.
const parseDatePart = (part: RawDatePart, now: DateTime): DateTime | undefined => {
  const dayMatch = part.dateText?.match(/(\d{1,2})(?:st|nd|rd|th)/i);
  const day = dayMatch ? Number(dayMatch[1]) : undefined;
  const monthKey = lookupKey(part.monthShort);
  const month = monthKey ? MONTHS[monthKey] : undefined;
  if (!day || !month) {
    console.warn("Could not parse date part", JSON.stringify(part));
    return undefined;
  }

  const explicitYear = part.year ? Number(part.year) : undefined;

  // Year is only rendered when it differs from the current year, so an absent
  // year means "this year" unless that lands in the past (New Year rollover guard).
  let year = explicitYear ?? now.year;
  let parsed = DateTime.fromObject({ year, month, day }, { zone: LOCAL_TIME_ZONE });

  if (!parsed.isValid) {
    console.warn("Invalid date built from card", JSON.stringify(part));
    return undefined;
  }

  if (!explicitYear && parsed < now.minus({ days: 1 })) {
    year += 1;
    parsed = DateTime.fromObject({ year, month, day }, { zone: LOCAL_TIME_ZONE });
  }

  const weekdayKey = lookupKey(part.dayShort);
  const expectedWeekday = weekdayKey ? WEEKDAYS[weekdayKey] : undefined;
  if (expectedWeekday && parsed.weekday !== expectedWeekday) {
    console.warn(
      `Weekday mismatch for ${parsed.toFormat("yyyy-MM-dd")}: card says ${part.dayShort} (${expectedWeekday}), parsed ${parsed.weekday}`,
    );
    return undefined;
  }

  return parsed;
};

// Times are rendered as "8:30PM"; keep a spaced fallback for U+202F/U+00A0 variants.
const parseStartTime = (dateStr: string, timeText: string | null | undefined): DateTime | undefined => {
  const normalized = collapseWhitespace(timeText?.replace(/[\u202f\u00a0\u2009]/g, " "));
  if (!normalized) return undefined;

  const clean = normalized.toUpperCase();
  let parsed = DateTime.fromFormat(`${dateStr} ${clean}`, "yyyy-MM-dd h:mma", { zone: LOCAL_TIME_ZONE });
  if (!parsed.isValid) {
    parsed = DateTime.fromFormat(`${dateStr} ${clean}`, "yyyy-MM-dd h:mm a", { zone: LOCAL_TIME_ZONE });
  }

  if (!parsed.isValid) {
    console.warn(`Could not parse start time "${timeText}" for ${dateStr}`);
    return undefined;
  }

  return parsed;
};

const cleanDescription = (html?: string): string | undefined => {
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
  const genres = (categories ?? []).map((category) => category.trim()).filter((category) => category.length > 0);
  const genreOnly = genres.filter((category) => !NON_GENRE_CATEGORIES.has(category.toLowerCase()));
  return genreOnly.length ? genreOnly.join(", ") : undefined;
};

// config.eventFiles.past stores UTC instants; compare the venue-local calendar date
const toLocalDateString = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const parsed = DateTime.fromISO(iso);
  return parsed.isValid ? parsed.setZone(LOCAL_TIME_ZONE).toFormat("yyyy-MM-dd") : undefined;
};

const readAlgoliaConfig = async (
  page: Page,
): Promise<{ appId: string; apiKey: string; indexName: string } | undefined> => {
  try {
    const inlineConfig = await page.evaluate(() =>
      Array.from(document.querySelectorAll("script"))
        .map((script) => script.textContent ?? "")
        .join("\n"),
    );

    const credentials = inlineConfig.match(/liteClient\('([A-Z0-9]+)',\s*'([a-f0-9]+)'\)/);
    const indexName = inlineConfig.match(/indexName:\s*'([^']+)'/);

    if (!credentials || !indexName) {
      console.warn("Could not read the inline Algolia widget config, falling back to DOM-only fields");
      return undefined;
    }

    return { appId: credentials[1], apiKey: credentials[2], indexName: indexName[1] };
  } catch (error) {
    console.warn("Could not read the inline Algolia widget config, falling back to DOM-only fields", error);
    return undefined;
  }
};

// One hitsPerPage:100 request against the same secured key the widget uses. Optional:
// any failure leaves the DOM-only fields intact.
const fetchAlgoliaHits = async (page: Page, now: DateTime): Promise<Map<string, AlgoliaHit>> => {
  const hitsByGuid = new Map<string, AlgoliaHit>();

  const config = await readAlgoliaConfig(page);
  if (!config) return hitsByGuid;

  try {
    const cutoff = Math.floor(now.toSeconds()) - 48 * 3600;

    const response = await page.request.post(
      `https://${config.appId.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`,
      {
        headers: {
          "content-type": "application/json",
          "x-algolia-application-id": config.appId,
          "x-algolia-api-key": config.apiKey,
        },
        data: {
          requests: [
            {
              indexName: config.indexName,
              distinct: true,
              facets: ["Categories"],
              hitsPerPage: 100,
              page: 0,
              query: "",
              filters: `(DateEndUnix >= ${cutoff} OR DateStartUnix >= ${cutoff})`,
            },
          ],
        },
        timeout: 20000,
      },
    );

    if (!response.ok()) {
      console.warn(`Algolia enrichment failed with status ${response.status()}, continuing with DOM-only fields`);
      return hitsByGuid;
    }

    const body = (await response.json()) as { results?: Array<{ nbHits?: number; hits?: AlgoliaHit[] }> };
    const hits = body.results?.[0]?.hits ?? [];

    for (const hit of hits) {
      const guid = (hit.EventGuid ?? guidFromTicketUrl(hit.EventUrl))?.toLowerCase();
      if (guid) hitsByGuid.set(guid, hit);
    }

    console.log(`Algolia enrichment: ${hitsByGuid.size} hits (${body.results?.[0]?.nbHits ?? "?"} reported)`);
  } catch (error) {
    console.warn("Algolia enrichment unavailable, continuing with DOM-only fields", error);
  }

  return hitsByGuid;
};

// Cards are date-ascending and expanded by the load-more button plus an
// auto-scroll observer, so the count can jump by more than one page per click.
const loadAllCards = async (page: Page): Promise<number> => {
  let previousCount = 0;

  for (let iteration = 0; iteration < MAX_LOAD_MORE_ITERATIONS; iteration++) {
    const cardCount = await page.locator(CARD_SELECTOR).count();

    if (iteration > 0 && cardCount === previousCount) {
      console.log(`No new cards after load-more iteration ${iteration}, stopping at ${cardCount}`);
      break;
    }
    previousCount = cardCount;

    const loadMore = page.locator(LOAD_MORE_SELECTOR);
    const isVisible = await loadMore.isVisible().catch(() => false);
    const isEnabled = await loadMore.isEnabled().catch(() => false);

    if (!isVisible || !isEnabled) break;

    // The button can disappear mid-click once the last page lands
    await loadMore.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(LOAD_MORE_SETTLE_MS);
  }

  return page.locator(CARD_SELECTOR).count();
};

test("ScrapeHamiltonStationHotel", async ({ page, config }) => {
  const { city, eventFiles } = config;
  let events: ScrapedEvent[] = [];

  console.log("Scraping The Hamilton Station Hotel gig guide for", city);

  // Window: this week Wednesday 00:00 -> Sunday 24:00 in Australia/Sydney
  const now = DateTime.now().setZone(LOCAL_TIME_ZONE);
  const monday = now.startOf("week");
  const windowStart = monday.plus({ days: 2 }).toFormat("yyyy-MM-dd");
  const windowEnd = monday.plus({ days: 6 }).toFormat("yyyy-MM-dd");
  console.log(`Event window ${windowStart}..${windowEnd} (${LOCAL_TIME_ZONE})`);

  // Retry once: the cards are rendered client-side by Algolia, so
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

  const finalCardCount = await loadAllCards(page);
  console.log(`Found ${finalCardCount} event cards in the gig guide`);
  if (finalCardCount === 0) {
    throw new Error(`No event cards found at ${LISTING_URL} - the Oztix widget may have changed`);
  }

  const hitsByGuid = await fetchAlgoliaHits(page, now);

  // Emergency-only logo fallback; every card currently carries its own banner
  let logoBanner: string | undefined;
  try {
    const logoSrc = await page.locator("#logoImage img").first().getAttribute("src", { timeout: 5000 });
    logoBanner = toLogoUrl(logoSrc, page.url());
  } catch {
    logoBanner = undefined;
  }

  const rawEvents: RawEvent[] = await page.locator(CARD_SELECTOR).evaluateAll((cards) =>
    cards.map((card) => {
      const anchor = card.querySelector<HTMLAnchorElement>("a[href]");
      const image = card.querySelector<HTMLImageElement>(".event-picture img[src]");
      const dateParts = Array.from(card.querySelectorAll<HTMLElement>(".date-part")).map((part) => ({
        dayShort: part.querySelector(".day-short")?.textContent?.trim(),
        monthShort: part.querySelector(".month-short")?.textContent?.trim(),
        dateText: part.querySelector(".date-text")?.textContent?.trim(),
        year: part.querySelector(".date-year")?.textContent?.trim(),
      }));

      return {
        // .event-name only - .special-guests is a support-act lineup, never the name
        eventName: card.querySelector(".event-name")?.textContent?.replace(/\s+/g, " ").trim() || undefined,
        imgAlt: image?.getAttribute("alt")?.replace(/\s+/g, " ").trim() || undefined,
        isFree: Boolean(card.querySelector(".free-event-container .free-event-badge")),
        href: anchor?.getAttribute("href") ?? null,
        bannerSrc: image?.getAttribute("src") ?? null,
        dateParts,
        timeText: card.querySelector(".time")?.textContent?.trim() ?? null,
      };
    }),
  );

  const seenTicketUrls = new Set<string>();
  const seenNameDates = new Set<string>();

  for (const raw of rawEvents) {
    try {
      const eventName = raw.eventName ?? raw.imgAlt;
      if (!eventName) {
        console.warn("Skipping card with no event name");
        continue;
      }

      const ticketLink = canonicaliseTicketUrl(raw.href, LISTING_URL);
      if (!ticketLink) {
        console.warn(`Skipping ${eventName}: no parsable ticket link`);
        continue;
      }

      const hit = hitsByGuid.get(guidFromTicketUrl(ticketLink) ?? "");

      if (hit?.IsCancelled || hit?.IsPostponed) {
        console.log(`Skipping cancelled/postponed event ${eventName}`);
        continue;
      }

      const startPart = raw.dateParts[0];
      const startDate = startPart ? parseDatePart(startPart, now) : undefined;
      if (!startDate) {
        console.warn(`Skipping ${eventName}: no parsable start date`);
        continue;
      }

      const dateStr = startDate.toFormat("yyyy-MM-dd");
      const endPart = raw.dateParts[1];
      const endDate = endPart ? parseDatePart(endPart, now) : undefined;

      // Calendar-date comparison avoids DST edge cases. Multi-day cards overlap
      // the window; single-day cards must fall inside it.
      if (endDate && endDate.toFormat("yyyy-MM-dd") >= dateStr) {
        const endDateStr = endDate.toFormat("yyyy-MM-dd");
        if (dateStr > windowEnd || endDateStr < windowStart) continue;
      } else if (dateStr < windowStart || dateStr > windowEnd) {
        continue;
      }

      const nameDateKey = `${eventName.toLowerCase()}|${dateStr}`;

      if (seenTicketUrls.has(ticketLink) || seenNameDates.has(nameDateKey)) {
        console.log("Already in list " + eventName);
        continue;
      }

      // History check needs BOTH name and local date: past-events.json is city-wide
      // and annually recurring Hamo events reuse their names.
      const alreadyInPast = eventFiles.past.some(
        (past) =>
          past.eventName?.toLowerCase() === eventName.toLowerCase() &&
          toLocalDateString(past.eventDateTime) === dateStr,
      );
      if (alreadyInPast) {
        console.log("In past events " + eventName);
        continue;
      }

      console.log(eventName, "start");

      const start = parseStartTime(dateStr, raw.timeText);

      let eventDateTime: string | undefined;
      let eventStartTime: string | undefined;

      if (start) {
        eventStartTime = start.toISO() ?? undefined;
        eventDateTime = start.toUTC().toISO() ?? undefined;
      } else {
        eventDateTime =
          DateTime.fromISO(dateStr, { zone: LOCAL_TIME_ZONE }).toUTC().toISO() ?? undefined;
      }

      let eventEndTime: string | undefined;
      if (endDate) {
        eventEndTime = endDate.toISO() ?? undefined;
      } else if (hit?.DateEnd) {
        // DateEnd is a UTC instant without an offset
        let parsedEnd = DateTime.fromISO(hit.DateEnd, { zone: "utc" }).setZone(LOCAL_TIME_ZONE);
        if (parsedEnd.isValid) {
          // Midnight-crossing guard: an end before the start belongs to the next day
          if (start && parsedEnd < start) parsedEnd = parsedEnd.plus({ days: 1 });
          if (!start || parsedEnd > start) eventEndTime = parsedEnd.toISO() ?? undefined;
        }
      }

      const geo = hit?._geoloc;
      const lngLat =
        typeof geo?.lng === "number" && typeof geo?.lat === "number"
          ? [geo.lng, geo.lat]
          : VENUE_LNG_LAT;

      // PriceFrom === 0 is ambiguous (no price published), never proof of a free event
      const priceFrom = hit?.PriceFrom;
      const ticketCost = raw.isFree
        ? "Free Entry"
        : typeof priceFrom === "number" && priceFrom > 0
          ? `From $${priceFrom}`
          : undefined;

      const event: ScrapedEvent = {
        id: randomUUID(),
        eventName,
        eventDateTime,
        eventStartTime,
        eventEndTime,
        lngLat,
        localTimeZone: LOCAL_TIME_ZONE,
        genres: deriveGenres(hit?.Categories),
        eventDescription: cleanDescription(hit?.EventDescription),
        eventBannerImage: toBannerUrl(raw.bannerSrc, page.url()) ?? logoBanner,
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

      console.log(eventName, "end");
    } catch (error) {
      console.error(`Error processing event card ${raw.eventName ?? raw.imgAlt ?? "unknown"}`, error);
      continue;
    }
  }

  console.log(`Mapped ${events.length} events within ${windowStart}..${windowEnd}`);

  await sanitizeAndWriteToStagingFile(events, "HamiltonStationHotel", config);
});
