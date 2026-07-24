import "dotenv/config";
import { ScrapedEvent } from "../scrappers/types";
import { findMissingAddressAndLngLat } from "./findAddressAndLngLat";
import { getEventGenresWithAi } from "./ai/googleAi";
import { cityConfig } from "../cityConfig";
import { randomUUID } from "crypto";
import { writeToCompleteEventFiles, writeToIncompleteEventFiles } from "./writeToFiles";
import { findKnownAddressAndCoords } from "./findKnownAddressAndCoords";
import { aiRemoveNonMusicEvents } from "./ai/removeNonMusicEvents";
import { aiDedupCompleteEvents } from "./ai/dedupCompleteEvents";

(async () => {
  let completeEvent: ScrapedEvent[] = [];
  let incompleteEvent: ScrapedEvent[] = [];

  const city = process.env.PROJECT;

  if (!city) {
    throw new Error("Error: PROJECT environment variable is not set");
  }

  const config = await cityConfig(city);

  for (const event of config.eventFiles.staging as ScrapedEvent[]) {
    console.log("Mapping " + event.eventName);
    const knownVenueEvents = findKnownAddressAndCoords(event);
    const googleParsedEvent = await findMissingAddressAndLngLat(knownVenueEvents);

    let isAlreadyInPastEvents = false;

    for (const pastEvent of config.eventFiles.past) {
      if (
        pastEvent.venueAddress === googleParsedEvent.venueAddress &&
        pastEvent.eventDateTime === googleParsedEvent.eventDateTime
      ) {
        console.log("Is already a past event" + googleParsedEvent.eventName);
        isAlreadyInPastEvents = true;
      }
    }

    if (isAlreadyInPastEvents) {
      console.log("Already in past events - " + googleParsedEvent.eventName);
      incompleteEvent.push(googleParsedEvent);
      continue;
    }

    if (!googleParsedEvent.lngLat || !googleParsedEvent.eventDateTime) {
      incompleteEvent.push(googleParsedEvent);
      continue;
    }

    const eventWithGenres = {
      ...googleParsedEvent,
      genres: googleParsedEvent.genres?.length ? googleParsedEvent.genres : await getEventGenresWithAi(event),
    };

    const aiCheckedEvent = eventWithGenres;
    // const aiCheckedEvent =
    //   eventWithGenres.source && ["humanitix", "eventbrite"].includes(eventWithGenres.source)
    //     ? eventWithGenres
    //     : await aiCoordinateValidation(eventWithGenres);

    completeEvent.push({
      ...aiCheckedEvent,
      id: randomUUID(),
      userName: "sam",
      userEmail: "sam@hotmail.com",
      localTimeZone: "Australia/Sydney",
      source: aiCheckedEvent?.source ? aiCheckedEvent.source : "notScrapped",
    });
  }

  if (completeEvent.length > 0) {
    const { musicEvents, nonMusicEvents } = await aiRemoveNonMusicEvents(completeEvent);
    incompleteEvent.push(...nonMusicEvents);
    completeEvent = musicEvents;
  }

  if (completeEvent.length > 0) {
    const { dedupedEvents, removedEvents } = await aiDedupCompleteEvents(completeEvent);
    incompleteEvent.push(...removedEvents);
    completeEvent = dedupedEvents;
  }

  writeToCompleteEventFiles(completeEvent, config);
  writeToIncompleteEventFiles(incompleteEvent, config);
  process.exit(0);
})();
