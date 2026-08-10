import { ScrapedEvent } from "./types";
import { DateTime } from "luxon";
import { randomUUID } from "crypto";
import { sanitizeAndWriteToStagingFile } from "../helpers/sanitizeAndWriteToStaging";
import { test } from "./fixtures";

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

test("ScrapeHamiltonStationHotel", async ({ page, config }) => {
  const { city, eventFiles } = config;
  let events: ScrapedEvent[] = [];

  await page.goto("https://www.thehamiltonstationhotel.com/music", { waitUntil: "domcontentloaded" });

  // Event banner/poster images live in the gallery slider, not in the HTML content block.
  const rawBannerSrc = await page
    .locator(".sqs-gallery-block-slider img.thumb-image")
    .first()
    .getAttribute("data-src");
  const eventBannerImage = rawBannerSrc ? new URL(rawBannerSrc, page.url()).href : undefined;

  // Extract raw event data from all <p> elements in the sqs-html-content div
  const rawEvents = await page.$$eval(".sqs-html-content p", (paragraphs) => {
    const results: Array<{
      dateText: string;
      artistText: string;
      emTexts: string[];
      anchorHref: string | null;
      anchorText: string | null;
    }> = [];

    for (const p of paragraphs) {
      const strong = p.querySelector("strong");
      if (!strong) continue; // Skip paragraphs without a date strong element

      const dateText = strong.textContent?.trim() ?? "";
      if (!dateText) continue;

      // Check it looks like a date (uppercase day, comma, month)
      if (!/^[A-Z]+,\s+[A-Z]/.test(dateText)) continue;

      // Get all em elements
      const ems = p.querySelectorAll("em");
      const emTexts = Array.from(ems)
        .map((em) => em.textContent?.trim() ?? "")
        .filter(Boolean);

      // Get anchor info
      const anchor = p.querySelector("a");
      const anchorHref = anchor?.getAttribute("href") ?? null;
      const anchorText = anchor?.textContent?.trim() ?? null;

      // Extract artist text by cloning and removing strong, em, a elements
      const clone = p.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("strong, em, a").forEach((el) => el.remove());
      const artistText = clone.textContent?.trim() ?? "";

      if (!artistText) continue;

      results.push({ dateText, artistText, emTexts, anchorHref, anchorText });
    }

    return results;
  });

  const now = DateTime.now().setZone("Australia/Sydney");

  for (const raw of rawEvents) {
    try {
      // --- Parse date ---
      // Strip ordinal suffix (TH, ST, ND, RD) from the day number
      const cleanDate = raw.dateText.replace(/(\d+)(?:TH|ST|ND|RD)/gi, "$1");
      let eventDate = DateTime.fromFormat(cleanDate, "cccc, LLLL d", { zone: "Australia/Sydney" });

      if (!eventDate.isValid) {
        console.error(`Could not parse date: ${raw.dateText}`);
        continue;
      }

      // If the parsed date is before today, try inferring the next year
      if (eventDate < now) {
        eventDate = eventDate.set({ year: eventDate.year + 1 });
        // If still before today, skip (shouldn't happen for future events)
        if (eventDate < now) continue;
      }

      // --- Parse promoters ---
      let eventPromoters: string | undefined;
      let remainingEmTexts = [...raw.emTexts];

      if (remainingEmTexts.length > 0) {
        const firstEm = remainingEmTexts[0];
        if (/presents:|with:/i.test(firstEm)) {
          eventPromoters = firstEm.replace(/:\s*$/, "").trim();
          remainingEmTexts.shift();
        }
      }

      // --- Parse venue info from the last remaining <em> ---
      const venueEmText = remainingEmTexts.length > 0 ? remainingEmTexts[remainingEmTexts.length - 1] : "";

      let venueLocation: string | undefined;
      let eventStartTime: string | undefined;
      let ticketCost: string | undefined;

      // Parse venue info: "{Room} - {Time} {Doors|Start} - {Price/Status}"
      const venueRegex = /^([^-]+) - (\d{1,2}(?::(\d{2}))?(am|pm)) (Doors?|Start)(?: - (.*))?$/i;
      const venueMatch = venueEmText.match(venueRegex);

      if (venueMatch) {
        venueLocation = venueMatch[1].trim();
        const hourStr = venueMatch[2];
        // Normalize time to HH:mm format
        const timeParts = hourStr.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/i);
        if (timeParts) {
          let hour = parseInt(timeParts[1], 10);
          const minute = timeParts[2] ? parseInt(timeParts[2], 10) : 0;
          const ampm = timeParts[3].toLowerCase();

          if (ampm === "pm" && hour !== 12) hour += 12;
          if (ampm === "am" && hour === 12) hour = 0;

          eventStartTime = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        }

        // Price/status from the em text itself
        const priceStatus = venueMatch[6]?.trim();
        if (priceStatus && !/^(Free Entry|SOLD OUT)/i.test(priceStatus)) {
          ticketCost = priceStatus;
        } else if (priceStatus) {
          ticketCost = priceStatus;
        }
      }

      // --- Get ticket info from <a> if present ---
      let ticketLink: string | undefined;

      if (raw.anchorHref) {
        ticketLink = raw.anchorHref;
        if (raw.anchorText) {
          ticketCost = raw.anchorText;
        }
      }

      // --- Build event name (artist text) ---
      const eventName = raw.artistText;

      // Check for duplicates
      if (eventFiles.past.find((e) => e.eventName?.toLowerCase() === eventName.toLowerCase())) {
        console.log("In past events " + eventName);
        continue;
      }

      const alreadyChecked = events.some((event) => event.eventName?.toLowerCase() === eventName.toLowerCase());
      if (alreadyChecked) {
        console.log("Already in list " + eventName);
        continue;
      }

      console.log(eventName, "start");

      const event: ScrapedEvent = {
        id: randomUUID(),
        eventName,
        eventDateTime: eventDate.toUTC().toString(),
        eventStartTime,
        venueName: "Hamilton Station Hotel",
        venueAddress: "2-6 Beaumont Street, Islington, NSW, 2296, Australia",
        venueLink: "https://www.thehamiltonstationhotel.com",
        venueLocation,
        ticketCost,
        ticketLink,
        eventPromoters,
        source: "hamilton_station_hotel",
        localTimeZone: "Australia/Sydney",
        eventLink: "https://www.thehamiltonstationhotel.com/music",
        eventBannerImage,
      };

      events = [...events, event];

      console.log(eventName, "end");
    } catch (err) {
      console.error("Error processing event:", err);
    }
  }

  await sanitizeAndWriteToStagingFile(events, "HamiltonStationHotel", config);
});
