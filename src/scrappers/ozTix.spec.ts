import { DateTime } from "luxon";
import { ScrapedEvent } from "./types";
import { sanitizeAndWriteToStagingFile } from "../helpers/sanitizeAndWriteToStaging";
import { test } from "./fixtures";

const notGenres = ["18 plus", "tourism", "all ages"];

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

test("ScrapOztix", async ({ page, config }) => {
  let events: ScrapedEvent[] = [];
  let morePages = true;
  let pageNumber = 1;

  const { city, eventFiles } = config;

  const pageUrl = `https://www.oztix.com.au/search?q=${city.displayCityName}`;

  await page.goto(pageUrl);

  await page.waitForLoadState();

  while (morePages) {
    await page.waitForLoadState();

    const eventContainerElement = await page.locator(".search-event_container").all();

    for (const eventElement of eventContainerElement) {
      page.waitForLoadState();

      let event: ScrapedEvent = { source: "oz_tix", localTimeZone: "Australia/Sydney" };

      const eventNameNode = eventElement.locator(".event-details__name");

      let eventName: string | undefined = undefined;

      if (await eventNameNode.isVisible()) {
        eventName = (await eventElement.locator(".event-details__name").textContent()) ?? undefined;
      } else {
        continue;
      }

      let hasAlreadyBeenScrapped = false;

      if (
        eventName &&
        (eventName.toLowerCase().includes("trivia") ||
          eventName.toLowerCase().includes("cancelled") ||
          eventName.toLowerCase().includes("post-poned") ||
          eventName.toLowerCase().includes("postponed") ||
          eventName.toLowerCase().includes("combat") ||
          eventName.toLowerCase().includes("boxing") ||
          eventName.toLowerCase().includes("ufc") ||
          eventName.toLowerCase().includes("comedy") ||
          eventName.toLowerCase().includes("markets") ||
          eventName.toLowerCase().includes("market") ||
          eventName.toLowerCase().includes("bingo") ||
          eventName.toLowerCase().includes("wallsend library") ||
          eventName.toLowerCase().includes("karaoke") ||
          eventName.toLowerCase().includes("spiegeltent") ||
          eventName.toLowerCase().includes("circus") ||
          eventName.toLowerCase().includes("school") ||
          eventName.toLowerCase().includes("zine"))
      ) {
        continue;
      }

      if (eventFiles.past.find((e) => e.eventName?.toLowerCase() === eventName?.toLowerCase())) {
        hasAlreadyBeenScrapped = true;
        break;
      }

      if (hasAlreadyBeenScrapped) continue;

      console.log(eventName, "start");

      const eventHref = await eventElement.getAttribute("href");

      if (eventHref) {
        event.ticketLink = eventHref;
      }

      // Open the event detail page in a new tab so the current search results
      // page is not navigated. Some events redirect to external ticketing sites
      // and clicking them in the same tab would race with the `page.goto` calls
      // used to return to the search results ("navigation is interrupted by
      // another navigation").
      const eventDetailPage = await page.context().newPage();

      try {
        await eventDetailPage.goto(eventHref ?? page.url(), { waitUntil: "domcontentloaded" });

        await eventDetailPage.waitForLoadState("domcontentloaded");

        const headingNode = eventDetailPage.locator("h1").first();

        if (await headingNode.isVisible()) {
          const venueName = await eventDetailPage.locator(".event-details-item").first().innerText();

          if (!venueName.toLowerCase().includes("calmer")) {
            event.eventName = await headingNode.innerText();

            event.venueName = venueName;

            const eventImageUrl = await eventDetailPage.locator("#event-image").getAttribute("src");

            if (eventImageUrl) {
              const url = new URL(eventImageUrl);
              url.searchParams.set("width", "700");
              url.searchParams.set("height", "350");
              event.eventBannerImage = url.toString();
            }

            const promoterElement = await eventDetailPage.locator(".presented-by").first();

            if (await promoterElement.isVisible()) {
              event.eventPromoters = await promoterElement.innerText();
            }

            const rawDateTime = (await eventDetailPage.locator(".event-details-item").nth(1).innerText()).trim();

            const normalizedDateTime = rawDateTime.replace(/(\s)(\d:)/, "$10$2"); // Add leading zero if the hour is a single digit

            const dateTimeObject = DateTime.fromFormat(normalizedDateTime, "EEEE, d LLLL yyyy hh:mm a");

            const dateTimeSetToMidnight = dateTimeObject.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });

            event.eventDateTime = dateTimeSetToMidnight.toUTC().toString() || undefined;

            event.eventStartTime = dateTimeObject.toFormat("hh:mm a");

            const eventTags = await eventDetailPage.locator(".event-tag").all();

            for (const tag of eventTags) {
              const tagCopy = (await tag.innerText()).toLowerCase();

              if (!notGenres.includes(tagCopy) && !tagCopy.includes("days away")) {
                event.genres = event.genres ? event.genres.concat(`, ${tagCopy}`) : tagCopy;
              }
            }

            const priceNode = await eventDetailPage.locator(".ticket-price").first();

            if (await priceNode.isVisible()) {
              event.ticketCost = await priceNode.innerText();
            }

            const descriptionNode = eventDetailPage.locator(".event-description");

            if (await descriptionNode.isVisible()) {
              event.eventDescription = await descriptionNode.innerText();
            }

            event.localTimeZone = "Australia/Sydney";

            events = events.length ? [...events, event] : [event];
          }
        }
      } finally {
        await eventDetailPage.close();
      }

      console.log(eventName, "end");
    }

    ++pageNumber;

    const nextPageButton = page.locator('[aria-label="Next page"]');

    if (await nextPageButton.isVisible()) {
      await nextPageButton.click();
    } else {
      morePages = false;
    }
  }

  console.log("oztix mapping and writing");

  await sanitizeAndWriteToStagingFile(events, "OzTix", config);
});
