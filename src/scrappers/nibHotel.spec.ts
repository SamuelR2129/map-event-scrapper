import { ScrapedEvent } from "./types";
import { DateTime } from "luxon";
import { randomUUID } from "crypto";
import { sanitizeAndWriteToStagingFile } from "../helpers/sanitizeAndWriteToStaging";
import { checkRobotsAllowed } from "../helpers/robotsCheck";
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

test("ScrapeNibHotel", async ({ page, config }) => {
  const { city, eventFiles } = config;
  let events: ScrapedEvent[] = [];

  const robots = await checkRobotsAllowed("http://localhost:5173/");
  if (!robots.allowed) {
    console.log(`Skipping scrape: robots.txt disallows / (rule: "${robots.rule}")`);
    test.skip();
    return;
  }

  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });

  // Wait for the React SPA to render the event cards
  await page.locator("article.event-card").first().waitFor();

  // Extract raw event data from the rendered DOM (no direct JSON access)
  const rawEvents = await page.$$eval("article.event-card", (cards) => {
    const results: Array<{
      dateText: string;
      doorsText: string | null;
      roomTag: string | null;
      eventName: string;
      eventPromoters: string | null;
      priceText: string | null;
      eventLink: string | null;
    }> = [];

    for (const card of cards) {
      // .event-meta span:first-child = full date e.g. "Wednesday 12 August 2026"
      const dateText = card.querySelector(".event-meta span:nth-child(6)")?.textContent?.trim() ?? "";
      if (!dateText) continue;

      // .event-meta span:nth-child(2) = "Doors 20:30" (optional, absent on some cards)
      const doorsText = card.querySelector(".event-meta span:nth-child(2)")?.textContent?.trim() ?? null;
      // .event-meta .room-tag = venue room e.g. "Front Bar" / "Band Room" (optional)
      const roomTag = card.querySelector(".event-meta .room-tag")?.textContent?.trim() ?? null;
      // h3.event-name = event name
      const eventName = card.querySelector("h3.event-name")?.textContent?.trim() ?? "";
      if (!eventName) continue;

      // p.event-promoters (optional)
      const eventPromoters = card.querySelector("p.event-promoters")?.textContent?.trim() ?? null;
      // .event-footer .event-price = "$25" or "Free entry" (optional)
      const priceText = card.querySelector(".event-footer .event-price")?.textContent?.trim() ?? null;
      // .event-footer a.event-link = event link (same for all events, not a ticket link)
      const eventLink = card.querySelector("a.event-link")?.getAttribute("href") ?? null;

      results.push({ dateText, doorsText, roomTag, eventName, eventPromoters, priceText, eventLink });
    }

    return results;
  });

  const now = DateTime.now().setZone("Australia/Sydney");

  for (const raw of rawEvents) {
    try {
      // --- Parse date from "Wednesday 12 August 2026" ---
      const eventDate = DateTime.fromFormat(raw.dateText, "EEEE d LLLL yyyy", {
        zone: "Australia/Sydney",
      });

      if (!eventDate.isValid) {
        console.error(`Could not parse date: ${raw.dateText}`);
        continue;
      }

      // Skip events that are in the past
      if (eventDate < now) continue;

      // --- Parse doors time "Doors 20:30" into HH:mm ---
      let eventStartTime: string | undefined;
      if (raw.doorsText) {
        const doorsMatch = raw.doorsText.match(/^Doors\s+(\d{1,2}:\d{2})$/i);
        if (doorsMatch) {
          eventStartTime = doorsMatch[1];
        }
      }

      // --- Parse ticket cost, stripping "$" but skipping "Free entry" ---
      let ticketCost: string | undefined;
      if (raw.priceText && !/free\s*entry/i.test(raw.priceText)) {
        ticketCost = raw.priceText.replace("$", "").trim();
      }

      // --- Check for duplicates ---
      if (eventFiles.past.find((e) => e.eventName?.toLowerCase() === raw.eventName.toLowerCase())) {
        console.log("In past events " + raw.eventName);
        continue;
      }

      const alreadyChecked = events.some((event) => event.eventName?.toLowerCase() === raw.eventName.toLowerCase());
      if (alreadyChecked) {
        console.log("Already in list " + raw.eventName);
        continue;
      }

      console.log(raw.eventName, "start");

      const event: ScrapedEvent = {
        id: randomUUID(),
        eventName: raw.eventName,
        eventDateTime: eventDate.toUTC().toString(),
        eventStartTime,
        venueName: "Nib Hotel",
        venueAddress: "8 Esplanade Road, Hunters Bend, NSW 2296, Australia",
        venueLocation: raw.roomTag ?? undefined,
        ticketCost,
        eventPromoters: raw.eventPromoters ?? undefined,
        source: "nib_hotel",
        localTimeZone: "Australia/Sydney",
        eventLink: raw.eventLink ?? "https://www.nibhotel.com.au/music",
      };

      events = [...events, event];

      console.log(raw.eventName, "end");
    } catch (err) {
      console.error("Error processing event:", err);
    }
  }

  await sanitizeAndWriteToStagingFile(events, "NibHotel", config);
});
