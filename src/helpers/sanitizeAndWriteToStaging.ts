import { ScrapedEvent } from "../scrappers/types";
import { sanitizeEvents } from "./sanitizer";
import { CityConfig } from "../cityConfig";
import { deleteOldEvents } from "./deleteOldEvents";
import { writeWithFallback, getEventFilePath, readEventFile } from "./writeToFiles";

export const writeToStagingEventFile = (stagingEvents: ScrapedEvent[], scrapperName: string, config: CityConfig) => {
  // Read the file at merge time rather than trusting `config.eventFiles.staging`,
  // which is a snapshot from the start of the run and would re-add events that
  // `deleteOldEvents` has just pruned.
  const existing =
    readEventFile(config.city.cityName, "staging-events.json") ?? config.eventFiles.staging ?? [];

  const mergedEvents = [...existing, ...stagingEvents];

  writeWithFallback(
    getEventFilePath(config.city.cityName, "staging-events.json"),
    JSON.stringify(mergedEvents),
    `${scrapperName} scrapped and ${stagingEvents.length} events added to staging-events.`,
  );
};

export const sanitizeAndWriteToStagingFile = (events: ScrapedEvent[], scrapperName: string, config: CityConfig) => {
  let staging: ScrapedEvent[] = [];

  for (const event of events) {
    const name = event.eventName?.toLowerCase() ?? "";
    if (
      name.includes("trivia") ||
      name.includes("cancelled") ||
      name.includes("post-poned") ||
      name.includes("postponed") ||
      name.includes("combat") ||
      name.includes("boxing") ||
      name.includes("ufc") ||
      name.includes("comedy") ||
      name.includes("markets") ||
      name.includes("market") ||
      name.includes("bingo") ||
      name.includes("wallsend library") ||
      name.includes("karaoke") ||
      name.includes("spiegeltent") ||
      name.includes("circus") ||
      name.includes("school") ||
      name.includes("tower") ||
      name.includes("birdwatching") ||
      name.includes("walking tour") ||
      name.includes("wedding") ||
      name.includes("zine")
    ) {
      continue;
    }

    const sanitizedEvent = sanitizeEvents(event);
    staging.push(sanitizedEvent);
  }

  deleteOldEvents(config.city.cityName);

  writeToStagingEventFile(staging, scrapperName, config);
};
