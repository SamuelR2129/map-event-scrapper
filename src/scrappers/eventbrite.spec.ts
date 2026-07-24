import { ScrapedEvent } from "./types";
import { DateTime } from "luxon";
import { randomUUID } from "crypto";
import { sanitizeAndWriteToStagingFile } from "../helpers/sanitizeAndWriteToStaging";
import pastEventsRaw from "../eventFiles/newcastle/past-events.json";
const pastEvents = pastEventsRaw as ScrapedEvent[];
import { test } from "./fixtures";
import { parseDate } from "../helpers/parseDates";

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

test("Scrape eventbrite", async ({ page, config }) => {
  const { city } = config;
  let events: ScrapedEvent[] = [];
  let morePages = true;
  let pageNumber = 1;

  //const eventsInDatabase = await getAllEventsInDatabase();
  console.log(`Searching for`, city);

  await page.goto(
    `https://www.eventbrite.com/d/australia--${city.cityName}/music--events--this-week/?page=${pageNumber}`,
  );

  await page.waitForLoadState();

  while (morePages) {
    await page.waitForLoadState();

    const listLocator = page.locator('[class*="SearchResultPanelContentEventCardList-module__eventList"] > li');

    const count = (await listLocator.count()) - 1;

    for (let i = 0; i < count; i++) {
      let event: ScrapedEvent = { source: "eventbrite", localTimeZone: "Australia/Sydney" };

      const item = listLocator.nth(i);
      const eventNameNode = item.locator("h3").first();
      const eventName = await eventNameNode.innerText();

      if (pastEvents.find((e) => e.eventName?.toLowerCase() === eventName.toLowerCase())) {
        console.log("In db already " + eventName);
        continue;
      }

      if (events.find((x) => x.eventName === eventName)) {
        console.log("skipping duplicate " + eventName);
        continue;
      }

      console.log(`${eventName} start`);

      event.eventName = eventName;

      const bgImageNode = item.locator(".event-card-image").first();

      try {
        const imageUrl = await bgImageNode.getAttribute("src");

        if (imageUrl) {
          event.eventBannerImage = imageUrl;
        } else {
          console.warn(`Couldnt get imageUrl from event-card-image`);
        }
      } catch (e) {
        console.error(`Error getting eventBannerImage`, e);
      }

      const ticketNode = item.locator("a").first();

      event.ticketLink = (await ticketNode.getAttribute("href")) ?? undefined;

      event.ticketLink && (await page.goto(event.ticketLink));

      await page.waitForLoadState();

      const costNode = page.locator('[class*="priceTagWrapper"]').first();

      if (await costNode.isVisible()) {
        const ticketCost = (await costNode.innerText()).split("$")[1];
        console.log("ticketCost", ticketCost);
        event.ticketCost = ticketCost;
      }

      const organiserNode = page.locator('[class*="organizer-listing-info-variant-b__name-link"]').first();

      if (await organiserNode.isVisible()) {
        event.eventPromoters = await organiserNode.innerText();
        console.log(event.eventPromoters);
      }

      const dateTimeNodeOne = page.locator('[class*="date-info__full-datetime"]').first();
      const dateTimeNodeTwo = page.locator('[data-testid="event-datetime"]').first();

      let dateAndTime: string | undefined;

      if (await dateTimeNodeOne.isVisible()) {
        dateAndTime = await dateTimeNodeOne.innerText();
      } else if (await dateTimeNodeTwo.isVisible()) {
        dateAndTime = await dateTimeNodeTwo.innerText();
      }

      if (dateAndTime) {
        const [startPart] = dateAndTime.split(" - ");
        let [startDate, startTime] = startPart.split(" · ");
        console.log("Start Date:", startDate);
        console.log("Start Time:", startTime);

        let dateStr = startTime ? `${startDate} ${startTime}` : startDate;

        dateStr =
          dateStr.toLowerCase().includes("pm") || dateStr.toLowerCase().includes("pm") ? dateStr : dateStr + "pm";

        dateStr = dateStr.replace("Starts on ", "");

        console.log("raw date", dateStr);

        const parsedDate = await parseDate(dateStr);

        if (parsedDate) {
          const utc = parsedDate.toUTC().toISO();
          console.log("converted utc iso", utc);
          event.eventDateTime = utc;
          event.eventStartTime = startTime;
        } else {
          const dt = DateTime.fromFormat(dateStr, "LLLL d ha", { zone: "Australia/Sydney", locale: "en-AU" });
          console.log(dt.toUTC().toISO());
          event.eventDateTime = dt.toUTC().toISO() ?? undefined;
          event.eventStartTime = startTime;
        }
      }

      // Eventbrite changed their page structure - venue info is now in a
      // location section with data-testid="section-wrapper-location"
      const locationSection = page.locator('[data-testid="section-wrapper-location"]');

      if (await locationSection.isVisible()) {
        const addressElement = locationSection.locator("address").first();
        if (await addressElement.isVisible()) {
          const venueName = await addressElement.locator("h3").first().innerText();
          console.log("venueName", venueName);
          event.venueName = venueName;

          const addressParts = await addressElement.locator("p").allInnerTexts();
          console.log("addressParts", addressParts);
          event.venueAddress = addressParts.join(", ");
          console.log("venueAddress", event.venueAddress);
        }
      }

      const showMapButtonNode = page.locator('[aria-controls="event-location-map"]');

      if (await showMapButtonNode.isVisible()) {
        await showMapButtonNode.click();

        const drivingNode = page.locator('[aria-label="Walking directions"]');
        if (await drivingNode.isVisible()) {
          const hrefWithLngLat = await drivingNode.getAttribute("href");

          if (hrefWithLngLat) {
            const parsed = new URL(hrefWithLngLat);
            const coords = parsed.searchParams.get("daddr");
            const latLng = coords?.split(",").map(Number);

            if (latLng) {
              event.lngLat = [latLng[1], latLng[0]];
              console.log("lnglat", event.lngLat);
            }
          }
        }
      }

      const descriptionNode = page.locator('[id="event-description"]');

      if (await descriptionNode.isVisible()) {
        console.log("found description");
        event.eventDescription = await descriptionNode.innerText();
      }

      event.id = randomUUID();

      console.log(eventName, "end");

      events = events.length ? [...events, event] : [event];

      await page.goto(
        `https://www.eventbrite.com/d/australia--${city.cityName}/music--events--this-week/?page=${pageNumber}`,
      );
      await page.waitForLoadState();
    }

    ++pageNumber;

    const nextPageButton = page.locator('[aria-label="Next Page"]');

    if (await nextPageButton.isVisible()) {
      await nextPageButton.click();
    } else {
      morePages = false;
    }
  }

  await sanitizeAndWriteToStagingFile(events, "eventbrite", config);
});
