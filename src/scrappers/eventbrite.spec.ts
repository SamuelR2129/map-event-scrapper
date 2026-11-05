import { ScrapedEvent } from "./types";
import { DateTime } from "luxon";
import { randomUUID } from "crypto";
import type { Page } from "@playwright/test";
import { sanitizeAndWriteToStagingFile } from "../helpers/sanitizeAndWriteToStaging";
import { test } from "./fixtures";

const SYDNEY_TZ = "Australia/Sydney";
const WEEKDAY_NUMBERS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

type EventbriteDateField = { local?: string | null; utc?: string | null; timezone?: string | null } | null;

type EventbriteJsonLd = {
  startDate?: string | null;
  endDate?: string | null;
  eventStatus?: string | null;
  scheduleCount: number;
} | null;

type EventbritePageData = {
  startDate: EventbriteDateField;
  endDate: EventbriteDateField;
  isSeries: boolean;
  isParentEvent: boolean;
  hideStartDate: boolean;
  status?: string | null;
  salesStatus?: string | null;
  timezone: string;
  organizerName?: string;
  venueLatLng?: number[];
  jsonLd: EventbriteJsonLd;
  dtText: string;
  conversionBarText: string;
  priceText: string;
  title: string;
  descriptionText: string;
};

type EventbriteDateFields = {
  eventDateTime?: string;
  eventStartTime?: string;
  eventEndTime?: string;
  multiDate?: boolean;
  reason?: string;
};

const ticketIdFromLink = (link?: string | null): string | undefined => link?.match(/tickets-(\d+)/)?.[1] ?? undefined;

const cleanTicketLink = (link: string): string => link.split("?")[0];

/**
 * Reads Eventbrite's server rendered __NEXT_DATA__ payload (available at domcontentloaded and
 * unaffected by hydration / consent / sales-ended shells) plus the two scoped date nodes and the
 * JSON-LD block. Never scans body.innerText: pageProps.messages contains the literal string
 * "Multiple dates" on every page, including single-date ones.
 */
const readEventbritePage = async (page: Page): Promise<EventbritePageData> =>
  page.evaluate(() => {
    const inlineText = (node: Element | null | undefined): string => {
      const el = node as HTMLElement | null;
      const value = el?.innerText || node?.textContent || "";
      return value.replace(/\s+/g, " ").trim();
    };

    const blockText = (node: Element | null | undefined): string => {
      const el = node as HTMLElement | null;
      return (el?.innerText || node?.textContent || "").trim();
    };

    const htmlToText = (html: string): string => {
      if (!html) return "";
      const container = document.createElement("div");
      container.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden";
      container.innerHTML = html;
      document.body?.appendChild(container);
      const text = (container.innerText || container.textContent || "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      container.remove();
      return text;
    };

    let context: any = null;
    try {
      const payload = JSON.parse(document.getElementById("__NEXT_DATA__")?.textContent || "null");
      context = payload?.props?.pageProps?.context ?? null;
    } catch {
      context = null;
    }

    const basicInfo = context?.basicInfo ?? null;

    let jsonLd: EventbriteJsonLd = null;

    for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
      try {
        const parsed = JSON.parse(script.textContent || "null");
        const nodes = Array.isArray(parsed) ? parsed : parsed?.["@graph"] ? parsed["@graph"] : [parsed];

        for (const node of nodes) {
          const types = Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]];
          const isEvent = types.some((type: unknown) => typeof type === "string" && /event$/i.test(type));

          if (isEvent && node?.startDate) {
            jsonLd = {
              startDate: node.startDate ?? null,
              endDate: node.endDate ?? null,
              eventStatus: node.eventStatus ?? null,
              scheduleCount: Array.isArray(node.eventSchedule) ? node.eventSchedule.length : node.eventSchedule ? 1 : 0,
            };
          }
        }
      } catch {
        // ignore malformed JSON-LD blocks
      }
    }

    const descriptionModules = (context?.structuredContent?.modules ?? []).filter(
      (module: any) => module && module.type === "text" && typeof module.text === "string",
    );
    let descriptionText = htmlToText(descriptionModules.map((module: any) => module.text).join("\n"));

    if (!descriptionText) {
      descriptionText = blockText(document.querySelector('[data-testid="section-wrapper-overview"]'))
        .replace(/^Overview\s*/i, "")
        .replace(/\s*Read more\s*$/i, "")
        .trim();
    }

    const organizer = basicInfo?.organizer;
    const organizerName =
      typeof organizer === "string" ? organizer : typeof organizer?.name === "string" ? organizer.name : undefined;

    // ScrapedEvent.lngLat is [lng, lat]
    const latitude = Number(basicInfo?.venue?.address?.latitude);
    const longitude = Number(basicInfo?.venue?.address?.longitude);
    const venueLatLng =
      Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0
        ? [longitude, latitude]
        : undefined;

    return {
      startDate: basicInfo?.startDate ?? null,
      endDate: basicInfo?.endDate ?? null,
      isSeries: Boolean(basicInfo?.isSeries),
      isParentEvent: Boolean(basicInfo?.isParentEvent),
      hideStartDate: Boolean(basicInfo?.hideStartDate),
      status: basicInfo?.status ?? null,
      salesStatus: context?.salesStatus?.salesStatus ?? null,
      timezone: basicInfo?.startDate?.timezone || "Australia/Sydney",
      organizerName,
      venueLatLng,
      jsonLd,
      dtText: inlineText(document.querySelector('[data-testid="event-datetime"]')),
      conversionBarText: inlineText(document.querySelector('[data-testid="conversion-bar-date"]')),
      // Eventbrite's own class name is misspelled ("ConverstionBar")
      priceText: inlineText(
        document.querySelector('[class*="ConverstionBarWrapper"], [class*="ConversionBar-module"]'),
      ),
      title: document.title,
      descriptionText,
    };
  });

/** NBSP (U+00A0) + bullet (U+2022) is what Eventbrite renders today, not " · " (U+00B7). */
const normaliseEventbriteText = (text?: string | null): string =>
  (text ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s*[•·]\s*/g, " · ")
    .replace(/\s+/g, " ")
    .trim();

const isMultiDateEvent = (input: {
  isSeries?: boolean;
  isParentEvent?: boolean;
  startDateUtc?: string | null;
  endDateUtc?: string | null;
  dtText?: string;
  conversionBarText?: string;
  title?: string;
  jsonLdScheduleCount?: number;
}): { multi: boolean; reason?: string } => {
  // 1. structured flags are authoritative - catches same-day series (Ten Virgins, The Chosen)
  if (input.isSeries) return { multi: true, reason: "series (isSeries)" };
  if (input.isParentEvent) return { multi: true, reason: "series (isParentEvent)" };

  // 2. multi-day ranges that are not series (Watchfest 52h, Subsonic 63h)
  if (input.startDateUtc && input.endDateUtc) {
    const start = DateTime.fromISO(input.startDateUtc, { zone: "utc" });
    const end = DateTime.fromISO(input.endDateUtc, { zone: "utc" });

    if (start.isValid && end.isValid) {
      const hours = end.diff(start, "hours").hours;
      if (hours > 24) return { multi: true, reason: "date range (" + Math.round(hours) + "h)" };
    }
  }

  // 3. JSON-LD schedule fallback
  if ((input.jsonLdScheduleCount ?? 0) > 1) return { multi: true, reason: "jsonld eventSchedule" };

  // 4. scoped DOM text only (never body.innerText)
  for (const text of [input.dtText, input.conversionBarText].map(normaliseEventbriteText).filter(Boolean)) {
    if (/^multiple dates$/i.test(text)) return { multi: true, reason: "dom: 'Multiple dates'" };
    if (/\+\s*\d+\s*more/i.test(text)) return { multi: true, reason: "dom: '+ N more'" };

    const dateTokens = text.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{1,2}\b/gi) ?? [];
    if (dateTokens.length > 1) return { multi: true, reason: "dom: date range" };

    const weekdayTokens = text.match(/\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/gi) ?? [];
    if (weekdayTokens.length > 1 && /[-–—]/.test(text)) return { multi: true, reason: "dom: weekday range" };

    if (/\d\s*(?:am|pm)\s*(?:&|and)\s*\d/i.test(text)) return { multi: true, reason: "dom: multiple showtimes" };
  }

  // 5. title tiebreaker ("... Tickets, Multiple dates | Eventbrite")
  if (/multiple dates/i.test(input.title ?? "")) return { multi: true, reason: "title suffix" };

  return { multi: false };
};

/**
 * Yearless Eventbrite text ("Saturday, November 7") defaults to the current year, which turns a
 * January event parsed in November into a past date. Pick the candidate year whose weekday matches
 * the displayed weekday, then the candidate closest to now. Never blindly rolls a genuinely past
 * date forward.
 */
const resolveEventbriteYear = (parsed: DateTime, weekdayHint?: string): DateTime => {
  const now = DateTime.now().setZone(SYDNEY_TZ);
  const hintIndex = weekdayHint ? WEEKDAY_NUMBERS.indexOf(weekdayHint.slice(0, 3).toLowerCase()) : -1;
  const hintedWeekday = hintIndex >= 0 ? hintIndex + 1 : 0;

  const candidates = [parsed, parsed.plus({ years: 1 }), parsed.minus({ years: 1 })].filter((c) => c.isValid);
  const matching = hintedWeekday ? candidates.filter((c) => c.weekday === hintedWeekday) : [];
  const pool = matching.length ? matching : candidates;

  return pool.reduce((closest, candidate) =>
    Math.abs(candidate.diff(now, "days").days) < Math.abs(closest.diff(now, "days").days) ? candidate : closest,
  );
};

const parseEventbriteTime = (value: string): DateTime | undefined => {
  for (const format of ["h:mm a", "h a", "h:mm"]) {
    const parsed = DateTime.fromFormat(value.trim().toUpperCase(), format, { zone: SYDNEY_TZ, locale: "en-AU" });
    if (parsed.isValid) return parsed;
  }

  return undefined;
};

const parseEventbriteLocalPart = (datePart: string, timePart: string): DateTime | undefined => {
  const weekdayHint = datePart.match(/^([A-Za-z]+),?\s+/)?.[1];
  const withoutWeekday = datePart.replace(/^[A-Za-z]+,?\s+/, "").trim();
  const target = timePart ? withoutWeekday + " " + timePart : withoutWeekday;

  // Luxon needs "h a" / "h:mm a" - the combined "ha" / "h:mma" tokens never parse "7 PM" / "7:00 PM"
  const formats = timePart
    ? ["LLLL d h:mm a", "LLLL d h a", "LLL d h:mm a", "LLL d h a", "LLLL d h:mm", "LLL d h:mm"]
    : ["LLLL d", "LLL d", "LLLL d yyyy", "LLL d yyyy"];

  for (const format of formats) {
    const parsed = DateTime.fromFormat(target, format, { zone: SYDNEY_TZ, locale: "en-AU" });
    if (parsed.isValid) return resolveEventbriteYear(parsed, weekdayHint);
  }

  return undefined;
};

/** Last-resort DOM parser for [data-testid="event-datetime"], e.g. "Saturday, September 12 · 9 PM - 3 AM". */
const parseEventbriteDomDateTime = (rawText?: string | null): EventbriteDateFields => {
  const text = normaliseEventbriteText(rawText);

  if (!text) return {};
  if (/^multiple dates$/i.test(text)) return { multiDate: true, reason: "dom: 'Multiple dates'" };
  if (/\+\s*\d+\s*more/i.test(text)) return { multiDate: true, reason: "dom: '+ N more'" };
  if (/\d\s*(?:am|pm)\s*(?:&|and)\s*\d/i.test(text)) return { multiDate: true, reason: "dom: multiple showtimes" };

  const [datePartRaw, timePartRaw = ""] = text.split(" · ");
  const datePart = datePartRaw.replace(/^starts on\s+/i, "").replace(/\s*\((?:aest|aedt)\)\s*$/i, "").trim();
  if (!datePart) return {};

  const dateTokens = datePart.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{1,2}\b/gi) ?? [];
  const weekdayTokens = datePart.match(/\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/gi) ?? [];
  if (dateTokens.length > 1 || (weekdayTokens.length > 1 && /[-–—]/.test(datePart))) {
    return { multiDate: true, reason: "dom: date range" };
  }

  const rangeMatch = timePartRaw.match(
    /^(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))$/i,
  );
  const singleTime = /^\d{1,2}(?::\d{2})?\s*(?:am|pm)$/i.test(timePartRaw.trim()) ? timePartRaw.trim() : "";

  const startTimeRaw = rangeMatch ? rangeMatch[1] : singleTime;
  const endTimeRaw = rangeMatch ? rangeMatch[2] : "";
  if (!startTimeRaw) return {};

  const start = parseEventbriteLocalPart(datePart, startTimeRaw);
  if (!start?.isValid) return {};

  const fields: EventbriteDateFields = {
    eventDateTime: start.toUTC().toISO() ?? undefined,
    eventStartTime: start.toFormat("h:mm a"),
  };

  if (endTimeRaw) {
    const parsedEnd = parseEventbriteTime(endTimeRaw);
    if (parsedEnd?.isValid) {
      let end = start.set({ hour: parsedEnd.hour, minute: parsedEnd.minute, second: 0, millisecond: 0 });
      if (end <= start) end = end.plus({ days: 1 }); // midnight-crossing session, e.g. 9 PM - 3 AM
      fields.eventEndTime = end.toFormat("h:mm a");
    }
  }

  return fields;
};

const parseEventbriteStructuredDate = (
  field: EventbriteDateField | undefined,
  timezone: string,
): DateTime | undefined => {
  if (!field) return undefined;

  if (field.utc) {
    const fromUtc = DateTime.fromISO(field.utc, { zone: "utc" });
    if (fromUtc.isValid) return fromUtc;
  }

  if (field.local) {
    // .local is wall clock with NO offset - parsing it without an explicit zone shifts 10-11h
    const fromLocal = DateTime.fromISO(field.local, { zone: field.timezone || timezone });
    if (fromLocal.isValid) return fromLocal;
  }

  return undefined;
};

const buildEventbriteDateFields = (data: EventbritePageData): EventbriteDateFields => {
  const timezone = data.timezone || SYDNEY_TZ;
  const start = parseEventbriteStructuredDate(data.startDate, timezone);

  if (start) {
    const fields: EventbriteDateFields = {
      eventDateTime: start.toUTC().toISO() ?? undefined,
      eventStartTime: start.setZone(timezone).toFormat("h:mm a"),
    };

    const end = parseEventbriteStructuredDate(data.endDate, timezone);
    if (end && end.toUTC() > start.toUTC()) {
      fields.eventEndTime = end.setZone(timezone).toFormat("h:mm a");
    }

    return fields;
  }

  // FALLBACK A: JSON-LD already carries the +10:00 / +11:00 offset
  const jsonLdStart = data.jsonLd?.startDate ? DateTime.fromISO(data.jsonLd.startDate, { zone: timezone }) : undefined;

  if (jsonLdStart?.isValid) {
    const fields: EventbriteDateFields = {
      eventDateTime: jsonLdStart.toUTC().toISO() ?? undefined,
      eventStartTime: jsonLdStart.setZone(timezone).toFormat("h:mm a"),
    };

    const jsonLdEnd = data.jsonLd?.endDate ? DateTime.fromISO(data.jsonLd.endDate, { zone: timezone }) : undefined;
    if (jsonLdEnd?.isValid && jsonLdEnd.toUTC() > jsonLdStart.toUTC()) {
      fields.eventEndTime = jsonLdEnd.setZone(timezone).toFormat("h:mm a");
    }

    return fields;
  }

  // FALLBACK B: scoped DOM text with year resolution
  return parseEventbriteDomDateTime(data.dtText);
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
  console.log("Downloaded " + (totalBytes / 1024 / 1024).toFixed(2) + " MB");
});

test("Scrape eventbrite", async ({ page, config }) => {
  const { city, eventFiles } = config;
  const listingUrl = (page: number) =>
    "https://www.eventbrite.com/d/australia--" + city.cityName + "/music--events--this-week/?page=" + page;

  let events: ScrapedEvent[] = [];
  let morePages = true;
  let pageNumber = 1;
  let cardsSeen = 0;
  let skippedMultiDate = 0;
  let duplicates = 0;
  let errors = 0;

  // dedupe by Eventbrite's numeric id from /tickets-(\d+)/ - names are not unique and were re-adding rows
  const seenTicketIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const existing of [...eventFiles.past, ...eventFiles.staging]) {
    const id = ticketIdFromLink(existing.ticketLink);
    if (id) seenTicketIds.add(id);
    if (existing.eventName) seenNames.add(existing.eventName.toLowerCase());
  }

  console.log("Searching for", city.cityName);

  await page.goto(listingUrl(pageNumber), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");

  const returnToListing = async () => {
    await page.goto(listingUrl(pageNumber), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load").catch(() => {});
    await page
      .locator('[class*="SearchResultPanelContentEventCardList-module__eventList"] > li')
      .first()
      .waitFor({ state: "attached", timeout: 15000 })
      .catch(() => {});
  };

  while (morePages) {
    const listLocator = page.locator('[class*="SearchResultPanelContentEventCardList-module__eventList"] > li');
    await listLocator.first().waitFor({ state: "attached", timeout: 15000 }).catch(() => {});

    const count = await listLocator.count();
    console.log("Page " + pageNumber + ": " + count + " cards");

    for (let i = 0; i < count; i++) {
      const item = listLocator.nth(i);
      let eventName = "";
      let ticketId: string | undefined;

      try {
        cardsSeen += 1;

        eventName = (await item.locator("h3").first().innerText()).trim();
        const ticketLink = (await item.locator("a").first().getAttribute("href")) ?? undefined;
        ticketId = ticketIdFromLink(ticketLink);

        if (ticketId && seenTicketIds.has(ticketId)) {
          duplicates += 1;
          console.log("Duplicate ticket id " + ticketId + " - skipping " + eventName);
          continue;
        }

        if (!ticketId && seenNames.has(eventName.toLowerCase())) {
          duplicates += 1;
          console.log("In db already " + eventName);
          continue;
        }

        if (!ticketLink) {
          errors += 1;
          console.error("No ticket link for " + eventName);
          continue;
        }

        console.log(eventName + " start");

        const event: ScrapedEvent = {
          source: "eventbrite",
          localTimeZone: SYDNEY_TZ,
          eventName,
          ticketLink: cleanTicketLink(ticketLink),
        };

        const bannerImage = await item
          .locator(".event-card-image")
          .first()
          .getAttribute("src")
          .catch(() => null);

        if (bannerImage) {
          event.eventBannerImage = bannerImage;
        } else {
          console.warn("Couldnt get imageUrl from event-card-image");
        }

        await page.goto(ticketLink, { waitUntil: "domcontentloaded" });
        // "load" (not just domcontentloaded): the conversion bar price and organiser hydrate after the
        // initial HTML, so reading any earlier loses ticketCost/eventPromoters
        await page.waitForLoadState("load").catch(() => {});
        await page
          .waitForFunction(() => !!document.getElementById("__NEXT_DATA__"), undefined, { timeout: 10000 })
          .catch(() => {});

        const data = await readEventbritePage(page);

        // skip BEFORE any price / organiser / venue / map / description work
        const verdict = isMultiDateEvent({
          isSeries: data.isSeries,
          isParentEvent: data.isParentEvent,
          startDateUtc: data.startDate?.utc,
          endDateUtc: data.endDate?.utc,
          dtText: data.dtText,
          conversionBarText: data.conversionBarText,
          title: data.title,
          jsonLdScheduleCount: data.jsonLd?.scheduleCount,
        });

        if (verdict.multi) {
          skippedMultiDate += 1;
          console.warn(
            'Skipping "' +
              eventName +
              '" - multiple dates/sessions (' +
              verdict.reason +
              "); start=" +
              (data.startDate?.local ?? "?") +
              " end=" +
              (data.endDate?.local ?? "?") +
              " " +
              event.ticketLink,
          );

          await returnToListing();
          continue;
        }

        const dateFields = buildEventbriteDateFields(data);

        if (!dateFields.eventDateTime) {
          errors += 1;
          console.error(
            'Missing eventDateTime for "' +
              eventName +
              '" (' +
              event.ticketLink +
              ") - no __NEXT_DATA__ basicInfo, JSON-LD or DOM date; skipping",
          );

          await returnToListing();
          continue;
        }

        event.eventDateTime = dateFields.eventDateTime;
        event.eventStartTime = dateFields.eventStartTime;
        event.eventEndTime = dateFields.eventEndTime;
        event.localTimeZone = data.timezone || SYDNEY_TZ;

        if (data.organizerName) {
          event.eventPromoters = data.organizerName;
        }

        const costNode = page.locator('[class*="priceTagWrapper"]').first();

        if (await costNode.isVisible().catch(() => false)) {
          const ticketCost = (await costNode.innerText()).split("$")[1];
          if (ticketCost) {
            event.ticketCost = ticketCost;
          }
        }

        if (!event.ticketCost && data.priceText) {
          const priceMatch = data.priceText.match(/(?:From\s+)?A?\$([\d,.]+)/i);
          if (priceMatch) {
            event.ticketCost = priceMatch[1];
          }
        }

        const organiserNode = page.locator('[class*="organizer-listing-info-variant-b__name-link"]').first();

        if (await organiserNode.isVisible().catch(() => false)) {
          const organiser = (await organiserNode.innerText()).trim();
          if (organiser) {
            event.eventPromoters = organiser;
          }
        }

        // venue info lives in a location section with data-testid="section-wrapper-location"
        const locationSection = page.locator('[data-testid="section-wrapper-location"]');

        if (await locationSection.isVisible().catch(() => false)) {
          const addressElement = locationSection.locator("address").first();

          if (await addressElement.isVisible().catch(() => false)) {
            const venueName = await addressElement
              .locator("h3")
              .first()
              .innerText()
              .catch(() => "");

            if (venueName.trim()) {
              event.venueName = venueName.trim();
            }

            const addressParts = await addressElement
              .locator("p")
              .allInnerTexts()
              .catch(() => []);
            const venueAddress = addressParts
              .map((part) => part.trim())
              .filter(Boolean)
              .join(", ");

            if (venueAddress) {
              event.venueAddress = venueAddress;
            }
          }
        }

        // "How do you want to get there?" links already carry daddr; the old map toggle is gone
        let directionsHref: string | null = null;
        const directionsNode = page
          .locator('[aria-label="Walking directions"], [aria-label="Driving directions"]')
          .first();

        if (await directionsNode.isVisible().catch(() => false)) {
          directionsHref = await directionsNode.getAttribute("href").catch(() => null);
        }

        if (!directionsHref) {
          const showMapButtonNode = page.locator('[aria-controls="event-location-map"]').first();

          if (await showMapButtonNode.isVisible().catch(() => false)) {
            await page
              .getByRole("button", { name: /accept|agree/i })
              .first()
              .click({ timeout: 1000 })
              .catch(() => {});
            await showMapButtonNode.click().catch(() => {});

            const clickedDirections = page.locator('[aria-label="Walking directions"]').first();

            if (await clickedDirections.isVisible().catch(() => false)) {
              directionsHref = await clickedDirections.getAttribute("href").catch(() => null);
            }
          }
        }

        if (directionsHref) {
          const parsed = new URL(directionsHref, "https://maps.google.com");
          const coords = parsed.searchParams.get("daddr");
          const latLng = coords?.split(",").map(Number);

          if (latLng && latLng.length >= 2 && latLng.every((value) => Number.isFinite(value))) {
            event.lngLat = [latLng[1], latLng[0]];
          }
        }

        if (!event.lngLat && data.venueLatLng) {
          event.lngLat = data.venueLatLng;
        }

        if (data.descriptionText) {
          event.eventDescription = data.descriptionText;
        }

        event.id = randomUUID();
        events.push(event);

        if (ticketId) seenTicketIds.add(ticketId);
        seenNames.add(eventName.toLowerCase());

        console.log(
          eventName +
            " end " +
            (event.eventDateTime ?? "") +
            " " +
            (event.eventStartTime ?? "") +
            " - " +
            (event.eventEndTime ?? ""),
        );

        await returnToListing();
      } catch (err) {
        errors += 1;
        console.error('Failed to scrape "' + (eventName || "card " + i) + '"', err);
        await returnToListing().catch(() => {});
        continue;
      }
    }

    pageNumber += 1;

    const nextPageButton = page.locator('[aria-label="Next Page"]');

    if (await nextPageButton.isVisible().catch(() => false)) {
      await nextPageButton.click().catch(() => {});
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(1500);
    } else {
      morePages = false;
    }
  }

  console.log(
    "Eventbrite: " +
      cardsSeen +
      " cards seen, " +
      events.length +
      " written, " +
      skippedMultiDate +
      " skipped (multi-date), " +
      duplicates +
      " duplicates, " +
      errors +
      " errors",
  );

  await sanitizeAndWriteToStagingFile(events, "eventbrite", config);
});
