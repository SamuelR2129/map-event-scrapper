import { ScrapedEvent } from "./types";
import { DateTime } from "luxon";
import { randomUUID } from "crypto";
import { Page } from "playwright";
import { sanitizeAndWriteToStagingFile } from "../helpers/sanitizeAndWriteToStaging";
import { test } from "./fixtures";

const BASE_URL = "https://thelass.com.au";
const LOCAL_TIME_ZONE = "Australia/Sydney";

type RawEvent = {
  eventName?: string;
  eventLinkHref?: string | null;
  dates: string[];
  startTimeText: string | null;
  endTimeText: string | null;
  bannerSrc: string | null;
  description: string;
  ticketHref: string | null;
};

let totalBytes = 0;

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (["image", "font", "media", "png", "jpeg", "gif"].includes(type)) {
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

// Remove Squarespace/Instagram tracking params from ticket links
const cleanTrackingParams = (href: string): string | undefined => {
  try {
    const url = new URL(href);
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "fbclid" || key === "igshid") {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return undefined;
  }
};

// Prefer the original-resolution data-src, normalise to https and strip ?format=
const normalizeBannerUrl = (src: string | null | undefined): string | undefined => {
  if (!src) return undefined;
  try {
    const url = new URL(src);
    url.protocol = "https:";
    url.searchParams.delete("format");
    return url.href;
  } catch {
    return undefined;
  }
};

// Squarespace renders '5:00 pm' with a U+202F narrow no-break space before the meridiem
const normalizeParseableTime = (timeText: string | null | undefined): string | undefined => {
  if (!timeText) return undefined;
  return timeText.replace(/[\u202f\u00a0\u2009]/g, " ").trim().toLowerCase();
};

// Parse a wall-clock time (e.g. '5:00 pm') against the date attribute in Australia/Sydney.
// NEVER trusts the Google Calendar/JSON-LD UTC offsets exported by Squarespace.
const parseLocalTime = (dateAttr: string, timeText: string): DateTime | undefined => {
  const clean = `${dateAttr} ${timeText}`;
  let parsed = DateTime.fromFormat(clean, "yyyy-MM-dd h:mm a", { zone: LOCAL_TIME_ZONE });
  if (!parsed.isValid) {
    parsed = DateTime.fromFormat(clean, "yyyy-MM-dd h a", { zone: LOCAL_TIME_ZONE });
  }
  return parsed.isValid ? parsed : undefined;
};

// Derive genres from description keyword matches (no category/tag meta exists on the site)
const deriveGenres = (description?: string): string | undefined => {
  if (!description) return undefined;
  const keywordGenrePairs: Array<[RegExp, string]> = [
    [/\bindie\b/i, "indie"],
    [/\brock\b/i, "rock"],
    [/\bpunk\b/i, "punk"],
    [/\bjazz\b/i, "jazz"],
    [/\btechno\b/i, "techno"],
    [/\btrance\b/i, "trance"],
    [/\bhouse\b/i, "house"],
    [/\bdrum and bass\b|\bdnb\b/i, "drum and bass"],
    [/\bhard dance\b/i, "hard dance"],
    [/\bbass\b/i, "bass"],
    [/\bafrobeats\b/i, "afrobeats"],
    [/\bamapiano\b/i, "amapiano"],
    [/\bpsych\b/i, "psych"],
    [/\bsoul\b/i, "soul"],
    [/\br&b\b/i, "r&b"],
    [/\bhip-hop\b/i, "hip-hop"],
    [/\bdrag\b/i, "drag"],
    [/\bbingo\b/i, "bingo"],
    [/\bcomedy\b/i, "comedy"],
  ];
  const matched = keywordGenrePairs.filter(([re]) => re.test(description)).map(([, genre]) => genre);
  return matched.length ? [...new Set(matched)].join(", ") : undefined;
};

// Named collectives e.g. 'Seatbelt collective', 'BOX EVENTS', 'PyN x Afterhrs'
const derivePromoters = (description?: string): string | undefined => {
  if (!description) return undefined;
  const match = description.match(/(presents|proudly presents|hosting)[\s:]+([A-Z][^,.;\n]+)/i);
  return match ? match[2].trim() : undefined;
};

// The listing page shows no prices for ticketed events; they live on the
// yourkind ticket page (e.g. "From A$10.00 AUD + BF"). Fetch that page to
// extract the minimum ticket price. Printable/event-finished pages may omit it.
const fetchTicketPrice = async (page: Page, ticketLink: string): Promise<string | undefined> => {
  try {
    const res = await page.goto(ticketLink, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (!res || !res.ok()) {
      console.warn(`Could not load ticket page ${ticketLink} (${res?.status()})`);
      return undefined;
    }
    const text = await page.locator("body").innerText();
    // e.g. rendered as "FROM\n\nA$10\n\n.00 AUD\n\n+ BF" (decimal split across
    // elements) or "From A$10.00 AUD + BF" - handle both by allowing the
    // dollars and cents to be separated by whitespace/newlines.
    const match = text.match(/From\s*A\$\s*(\d+)[\s.]*(\d{1,2})?\s*AUD/i);
    if (!match) return undefined;
    return match[2] ? `$${match[1]}.${match[2]} AUD` : `$${match[1]} AUD`;
  } catch (error) {
    console.warn(`Error fetching ticket price from ${ticketLink}`, error);
    return undefined;
  }
};

test("thelass.com.au", async ({ page, config }) => {
  const { city, eventFiles } = config;
  let events: ScrapedEvent[] = [];

  console.log(`Scraping The Lass O'Gowrie What's On for`, city);

  // Window: today 00:00 -> Sunday 24:00 in Australia/Sydney
  const now = DateTime.now().setZone(LOCAL_TIME_ZONE);
  const windowStart = now.startOf("day").toFormat("yyyy-MM-dd");
  const windowEnd = now
    .startOf("day")
    .plus({ days: (7 - now.weekday) % 7 })
    .toFormat("yyyy-MM-dd");
  console.log(`Event window ${windowStart}..${windowEnd} (${LOCAL_TIME_ZONE})`);

  // Retry navigation once on transient 503 responses
  let navigated = false;
  for (let attempt = 0; attempt < 2 && !navigated; attempt++) {
    try {
      await page.goto(`${BASE_URL}/whatson`, { waitUntil: "domcontentloaded" });
      await page.locator("article.eventlist-event").first().waitFor();
      navigated = true;
    } catch (error) {
      console.warn(`Navigation attempt ${attempt + 1} failed, retrying...`, error);
      await page.waitForTimeout(2000);
    }
  }
  if (!navigated) {
    throw new Error(`Could not load ${BASE_URL}/whatson`);
  }

  // All cards (upcoming + past) are present in the initial DOM - no pagination or load-more
  const cardCount = await page.locator("article.eventlist-event").count();
  console.log(`Found ${cardCount} event cards in the initial DOM`);

  const rawEvents: RawEvent[] = await page.locator("article.eventlist-event").evaluateAll((cards) =>
    cards.map((card) => {
      const titleLink = card.querySelector<HTMLAnchorElement>("h1.eventlist-title a.eventlist-title-link");
      const image = card.querySelector<HTMLImageElement>("a.eventlist-column-thumbnail img");
      const dateEls = card.querySelectorAll<HTMLTimeElement>("li.eventlist-meta-date time.event-date");
      const startTimeEl = card.querySelector<HTMLTimeElement>("time.event-time-localized-start");
      const endTimeEl = card.querySelector<HTMLTimeElement>("time.event-time-localized-end");
      const descriptionEl = card.querySelector<HTMLElement>("div.eventlist-description");
      const description = (descriptionEl?.innerText ?? "").replace(/\s+/g, " ").trim();
      const ticketAnchor = Array.from(descriptionEl?.querySelectorAll<HTMLAnchorElement>("a") ?? []).find((a) =>
        /yourkind\.io|humanitix\.com|eventbrite|oztix/i.test(a.getAttribute("href") ?? ""),
      );

      return {
        eventName: titleLink?.textContent?.trim() || image?.alt?.trim() || undefined,
        eventLinkHref: titleLink?.getAttribute("href") ?? null,
        dates: Array.from(dateEls, (d) => d.getAttribute("datetime") ?? "").filter(Boolean),
        startTimeText: startTimeEl?.textContent?.trim() ?? null,
        endTimeText: endTimeEl?.textContent?.trim() ?? null,
        bannerSrc: image?.getAttribute("data-src") || image?.getAttribute("src") || null,
        description,
        ticketHref: ticketAnchor?.getAttribute("href") ?? null,
      };
    }),
  );

  for (const raw of rawEvents) {
    try {
      const eventName = raw.eventName;
      const eventLink = raw.eventLinkHref ? new URL(raw.eventLinkHref, BASE_URL).href : undefined;

      if (!eventName || !eventLink) {
        console.warn("Skipping card missing event name or link", raw);
        continue;
      }

      // Dedupe within this run by event link
      if (events.some((e) => e.eventLink === eventLink)) {
        console.log("Duplicate event link, skipping " + eventName);
        continue;
      }

      // Skip events already recorded in the past events file
      if (eventFiles.past.find((e) => e.eventName?.toLowerCase() === eventName.toLowerCase())) {
        console.log("In past events already " + eventName);
        continue;
      }

      const startDate = raw.dates[0];
      const endDate = raw.dates[1];

      if (!startDate) {
        console.warn("No start date for " + eventName + ", skipping");
        continue;
      }

      // Date-window filter. Calendar YYYY-MM-DD string comparison avoids DST edge cases.
      // Single-day: keep when startDate is inside the window.
      // Multi-day: keep when the date range overlaps the window.
      if (endDate) {
        if (startDate > windowEnd || endDate < windowStart) continue;
      } else {
        if (startDate < windowStart || startDate > windowEnd) continue;
      }

      console.log(eventName, "start");

      // Parse displayed wall-clock times in Australia/Sydney (single-day events only;
      // multi-day events expose no time elements and are left with undefined times)
      let eventStartTime: string | undefined;
      let eventEndTime: string | undefined;
      let eventDateTime: string | undefined;

      const startTimeText = normalizeParseableTime(raw.startTimeText);
      const endTimeText = normalizeParseableTime(raw.endTimeText);

      if (startTimeText) {
        const start = parseLocalTime(startDate, startTimeText);
        if (start) {
          eventStartTime = start.toISO() ?? undefined;
          eventDateTime = start.toUTC().toISO() ?? undefined;

          if (endTimeText) {
            let end = parseLocalTime(startDate, endTimeText);
            // Midnight rollover: an end time-of-day earlier than the start (e.g. 5:00 pm -> 3:00 am)
            // belongs to the following day
            if (end && end < start) {
              end = end.plus({ days: 1 });
            }
            eventEndTime = end?.toISO() ?? undefined;
          }
        } else {
          console.error(`Could not parse start time "${raw.startTimeText}" for ${eventName}`);
        }
      }

      // Fall back to date-only midnight timestamps when no times exist
      if (!eventDateTime) {
        eventDateTime = DateTime.fromISO(startDate, { zone: LOCAL_TIME_ZONE }).toUTC().toISO() ?? undefined;
      }
      if (endDate && !eventEndTime) {
        eventEndTime = DateTime.fromISO(endDate, { zone: LOCAL_TIME_ZONE }).toISO() ?? undefined;
      }

      // Ticket cost: explicit FREE events are marked in the description; ticketed
      // events have no price on the listing page, so it is fetched in a second
      // pass from the yourkind ticket page (below).
      const isFreeEvent = /this is a FREE event/i.test(raw.description);
      const ticketCost: string | undefined = isFreeEvent ? "Free Entry" : undefined;

      const event: ScrapedEvent = {
        id: randomUUID(),
        eventName,
        eventDateTime,
        eventStartTime,
        eventEndTime,
        lngLat: [151.756027, -32.922325],
        localTimeZone: LOCAL_TIME_ZONE,
        genres: deriveGenres(raw.description),
        eventDescription: raw.description || undefined,
        eventBannerImage: normalizeBannerUrl(raw.bannerSrc),
        eventLink,
        eventPromoters: derivePromoters(raw.description),
        venueName: "The Lass O'Gowrie",
        venueLink: BASE_URL,
        socialLink: "https://www.facebook.com/Lassogowrie",
        venueAddress: "14 Railway St, Wickham NSW 2293",
        venueLocation: "Newcastle, NSW, Australia",
        ticketCost,
        ticketLink: raw.ticketHref ? cleanTrackingParams(raw.ticketHref) : undefined,
        source: "thelass_com_au",
      };

      events = [...events, event];

      console.log(eventName, "end");
    } catch (error) {
      console.error(`Error processing event card ${raw.eventName}`, error);
      continue;
    }
  }

  console.log(`Mapped ${events.length} events within the window`);

  // Second pass: fetch ticket prices for ticketed events from their yourkind
  // ticket pages. The listing page does not expose prices.
  for (const event of events) {
    if (event.ticketCost) continue;
    if (!event.ticketLink) continue;

    const price = await fetchTicketPrice(page, event.ticketLink);
    if (price) {
      event.ticketCost = price;
      console.log(`${event.eventName}: ticket price ${price}`);
    }
  }

  await sanitizeAndWriteToStagingFile(events, "thelass_com_au", config);
});