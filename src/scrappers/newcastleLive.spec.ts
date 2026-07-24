import { ScrapedEvent } from "./types";
import { randomUUID } from "crypto";
import { uploadImageToCloudinary } from "../helpers/uploadImageToCloudinary";
import pastEventsRaw from "../eventFiles/newcastle/past-events.json";
const pastEvents = pastEventsRaw as ScrapedEvent[];
import { sanitizeAndWriteToStagingFile } from "../helpers/sanitizeAndWriteToStaging";
//import { getAllEventsInDatabase } from "../apis/getAllEventsInDatabase";
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

test("ScrapNewcastleLive", async ({ page, config }) => {
  //const eventsInDatabase = await getAllEventsInDatabase();
  await page.goto("https://newcastlelive.com.au/gig-guide-event-calendar/live-music-in-newcastle/");
  let events: ScrapedEvent[] = [];

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  let startDay = today.getDate() + 2;
  console.log("startDate", startDay);
  const x = startDay + 2;
  console.log("endDate", x);

  while (startDay <= x) {
    const eventDateTime = new Date(year, month, startDay).toISOString();
    const currentDay = startDay.toString().padStart(2, "0");

    const dateElements = await page.locator(".event_date .date").filter({ hasText: currentDay }).all();

    for (const dateElement of dateElements) {
      try {
        const dateText = (await dateElement.textContent())?.trim();

        if (dateText === currentDay) {
          // Click the parent element (the whole date container)
          await dateElement.locator("..").click();

          let eventName = (await page.locator(".single-event-name").textContent())?.trim();

          // if (eventsInDatabase.find((e) => e.eventName.toLowerCase() === eventName?.toLowerCase())) {
          //   console.log("In db already " + eventName);

          //   await page.goto("https://newcastlelive.com.au/gig-guide-event-calendar/live-music-in-newcastle/");
          //   continue;
          // }

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
              eventName.toLowerCase().includes("tower") ||
              eventName.toLowerCase().includes("birdwatching") ||
              eventName.toLowerCase().includes("walking tour") ||
              eventName.toLowerCase().includes("wedding") ||
              eventName.toLowerCase().includes("zine"))
          ) {
            await page.goto("https://newcastlelive.com.au/gig-guide-event-calendar/live-music-in-newcastle/");
            continue;
          }

          const alreadyChecked = events.some((event) => event.eventName === eventName);

          if (alreadyChecked || pastEvents.find((e) => e.eventName?.toLowerCase() === eventName?.toLowerCase())) {
            await page.goto("https://newcastlelive.com.au/gig-guide-event-calendar/live-music-in-newcastle/");
            continue;
          }

          console.log("eventName start", eventName);

          let venueLocation = (await page.locator(".single-event-venue-name").textContent())?.trim();
          let venueAddress: string | undefined;
          let venueName: string | undefined;
          let eventPromoters: string | undefined;
          let eventDescription: string | undefined;
          let eventBannerImage: string | undefined;
          let eventStartTime: string | undefined;
          let id = randomUUID();
          let socialLink: string | undefined;

          if (venueLocation?.includes("Australia")) {
            venueAddress = venueLocation;
          } else {
            venueName = venueLocation;
          }

          const eventTimeLocator = page.locator(".single-event-time");
          if (await eventTimeLocator.isVisible()) {
            eventStartTime = (await eventTimeLocator.textContent())?.trim();
          }
          const multiEventTimeLocator = page.locator(".multi-event-dates");
          if (!eventStartTime && (await multiEventTimeLocator.isVisible())) {
            try {
              console.log(
                "eventStartTime",
                eventStartTime,
                "multiEventTimeLocator",
                await multiEventTimeLocator.textContent(),
              );
              const multiEventTime = await multiEventTimeLocator.textContent();
              eventStartTime = (multiEventTime && new Date(multiEventTime?.trim()).toISOString()) ?? undefined;
            } catch (e) {
              console.error("multiEventTimeLocator", e);
            }
          }

          const moreInfo = page.locator(".event-more-info .wp-block-button__link");

          const moreInfoHref = (await moreInfo.isVisible()) ? await moreInfo?.getAttribute("href") : undefined;

          if (moreInfoHref?.includes("https://www.facebook.com")) {
            socialLink = moreInfoHref;

            await moreInfo.click();

            await page.waitForLoadState();

            const blockingLoginPage = page.getByRole("button", { name: "Close" });

            if (!(await blockingLoginPage.isVisible())) {
              await page.goto("https://newcastlelive.com.au/gig-guide-event-calendar/live-music-in-newcastle/");

              continue;
            }

            await blockingLoginPage.click();

            const coverImgElement = page.locator('[data-imgperflogname="profileCoverPhoto"]').first();

            if (await coverImgElement.isVisible()) {
              const facebookCoverImg = await coverImgElement.getAttribute("src");

              eventBannerImage = facebookCoverImg && (await uploadImageToCloudinary(facebookCoverImg, id));
            } else {
              console.warn(`No cover image for ${eventName}`);
            }

            const promoterElements = await page.locator('span:has-text("Event by") strong').allTextContents();

            if (promoterElements.length === 1) {
              eventPromoters = promoterElements[0].trim();
            } else if (promoterElements.length > 1) {
              eventPromoters = promoterElements.join(", ").trim();
            }

            const eventDescriptionNode = page.locator(".x1ni5s2d span").first();

            if (await eventDescriptionNode.isVisible()) {
              const seeMoreButton = await page.locator(".x1ni5s2d").getByRole("button").first();
              if (await seeMoreButton.isVisible()) {
                await seeMoreButton.click();
              }
              eventDescription = (await eventDescriptionNode.textContent())?.trim();
            }

            if (!venueName) {
              //Venue name in the Map card

              const mapVenueLocator = page.locator("#«rc1»");

              if (await mapVenueLocator.isVisible()) {
                venueName = (await mapVenueLocator.textContent())?.trim();
              }
            }

            if (!venueAddress) {
              //Search for all addresses with a postcode and australia on the page.
              const potentialAddresses = page.locator("text=/\\b\\d{4}\\b.*Australia|Australia.*\\b\\d{4}\\b/i");

              const allPotentialAddresses = await potentialAddresses.allTextContents();

              const addresses = allPotentialAddresses.filter((address) => address.length < 60);

              if (addresses.length) {
                venueAddress = addresses[0]?.trim();
              }
            }
          }

          console.log("eventName end", eventName);

          events = [
            ...events,
            {
              id,
              eventName,
              eventBannerImage,
              venueLocation,
              venueName,
              venueAddress,
              eventStartTime,
              eventDateTime,
              eventLink: moreInfoHref ?? undefined,
              socialLink,
              eventPromoters,
              eventDescription,
              source: "newcastle_live",
              localTimeZone: "Australia/Sydney",
            },
          ];
        }
        await page.goto("https://newcastlelive.com.au/gig-guide-event-calendar/live-music-in-newcastle/");
      } catch (err) {
        console.log(err);
        return;
      }
    }

    startDay++;
  }

  await sanitizeAndWriteToStagingFile(events, "NewcastleLive", config);
});
