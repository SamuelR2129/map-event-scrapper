import { ScrapedEvent } from "./types";
import { DateTime } from "luxon";
import { randomUUID } from "crypto";
import { sanitizeAndWriteToStagingFile } from "../helpers/sanitizeAndWriteToStaging";
import { test } from "./fixtures";

let totalBytes = 0;

test.beforeEach(async ({ page }) => {
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

test("Scrape humanitix", async ({ page, config }) => {
  let events: ScrapedEvent[] = [];

  const { city, eventFiles } = config;

  console.log("cityData", city);

  const websiteUrl = `https://humanitix.com/au/events/au--nsw--${city.cityName}/music--thisweek?countryAndLocation=au--nsw--${city.cityName}&pathCategories=music--thisweek`;

  console.log("url", websiteUrl);

  await page.goto(`${websiteUrl}`, { waitUntil: "domcontentloaded" });

  await page.waitForLoadState("domcontentloaded");

  for (let click = 0; click < 50; click++) {
    const showMore = page.locator("span", { hasText: "Show More" });
    if (!(await showMore.isVisible())) break;
    await showMore.click();
    await page.waitForTimeout(1000);
  }

  await page.waitForLoadState("domcontentloaded");

  const eventLinks = page.locator('[data-target-page="event"]');

  const eventCount = await eventLinks.count();

  for (let i = 0; i < eventCount; i++) {
    let event: ScrapedEvent = { source: "humanitix", localTimeZone: "Australia/Sydney" };

    const eventUrl = await eventLinks.nth(i).getAttribute("href");
    if (!eventUrl) {
      console.error("No href found for event link, skipping");
      continue;
    }

    // Scrape each event in its own tab so the shared listing page is never
    // navigated. Event links point at the events.humanitix.com subdomain and
    // some event/ticket pages redirect or close themselves (external ticketing,
    // htmx popups), which would otherwise tear down the shared `page` and abort
    // the whole run with "Target page, context or browser has been closed".
    const eventDetailPage = await page.context().newPage();

    try {
      eventDetailPage.on("dialog", async (dialog) => {
        await dialog.accept();
      });

      await eventDetailPage.goto(eventUrl, { waitUntil: "domcontentloaded" });

      await eventDetailPage.waitForLoadState("domcontentloaded");

      const titleElement = eventDetailPage.locator("h1").first();

      const eventName = await titleElement.innerText();

      if (eventFiles.past.find((e) => e.eventName?.toLowerCase() === eventName.toLowerCase())) {
        console.log("In db already " + eventName);
        continue;
      }

      console.log(eventName, "start");

      event.eventName = eventName;

      const heroImage = eventDetailPage.locator('img[alt*="Banner"]').first();

      if (await heroImage.isVisible()) {
        event.eventBannerImage = (await heroImage.getAttribute("src")) ?? undefined;
      } else {
        console.error("hero banner image not found");
      }

      const timeElement = eventDetailPage.locator("time");

      const datetime = await timeElement.first().getAttribute("datetime");

      if (datetime) {
        const dateTimeObject = DateTime.fromISO(datetime);

        event.eventDateTime = dateTimeObject.set({ hour: 0, minute: 0, second: 0, millisecond: 0 }).toUTC().toString();

        event.eventStartTime = dateTimeObject.toLocaleString(DateTime.TIME_24_SIMPLE);
      }

      const venueNameElement = eventDetailPage.locator(".detail.location .detail-text .f-label-3").first();

      if (await venueNameElement.isVisible()) {
        event.venueName = (await venueNameElement.textContent())?.trim();
      }

      const ticketLinkNode = eventDetailPage.getByTestId("get-tickets-btn").first();

      event.ticketLink = (await ticketLinkNode.getAttribute("href")) ?? undefined;

      const descriptionNode = eventDetailPage.locator(".EventModuleRichText .RichContent").first();

      if (await descriptionNode.isVisible()) {
        event.eventDescription = (await descriptionNode.textContent()) ?? undefined;
      }

      //Address has multiple nodes, some with only the short address
      const addressElements = eventDetailPage.locator("address");
      const count = await addressElements.count();

      for (let j = 0; j < count; j++) {
        const el = addressElements.nth(j);
        const isVisible = await el.isVisible();

        if (!isVisible) continue;

        const text = (await el.textContent())?.trim() ?? "";

        //checks for postcode
        if (/\b\d{4}\b/.test(text)) {
          event.venueAddress = text;
          break;
        }
      }

      const mapImageElement = eventDetailPage.locator(".MapImage img").first();

      if (await mapImageElement.isVisible()) {
        const url = new URL((await mapImageElement.getAttribute("src")) ?? "");
        const center = url.searchParams.get("center");
        const latLng = center?.split(",").map((coord) => coord.trim());

        if (latLng) {
          event.lngLat = [Number(latLng[1]), Number(latLng[0])];
        }
      }

      const hostNameElement = eventDetailPage.locator(".hostname a").first();

      if (await hostNameElement.isVisible()) {
        event.eventPromoters = (await hostNameElement.textContent())?.trim();
      }

      event.eventLink = eventDetailPage.url();

      if (event.ticketLink) {
        await eventDetailPage.goto(event.ticketLink.toString(), { waitUntil: "domcontentloaded" });

        const ticketCostNode = eventDetailPage.locator(".price-label").first();

        if (await ticketCostNode.isVisible()) {
          event.ticketCost = await ticketCostNode.innerText();
        }
      }

      event.id = randomUUID();

      event.localTimeZone = "Australia/Sydney";

      console.log(eventName, "end");

      events = events.length ? [...events, event] : [event];
    } catch (err) {
      // A single event page closing/redirecting should not abort the whole run.
      console.error("Skipping event due to error:", eventUrl, err);
    } finally {
      await eventDetailPage.close().catch(() => {});
    }
  }

  await sanitizeAndWriteToStagingFile(events, "Humanitix", config);
});
