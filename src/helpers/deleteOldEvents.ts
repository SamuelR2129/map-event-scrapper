import { ScrapedEvent } from "../scrappers/types";
import { writeWithFallback, getEventFilePath, readEventFile } from "./writeToFiles";
import { isPastEvent, partitionPastAndUpcoming } from "./eventTime";

/** Stable identity for an event, used to avoid writing the same event to past-events twice. */
const eventKey = (event: ScrapedEvent) =>
  event.id ?? [event.source ?? "", event.eventName ?? "", event.eventDateTime ?? "", event.venueName ?? ""].join("|");

/**
 * Prune finished events out of staging-events.json, and move finished events from
 * complete-events.json and incomplete-events.json into past-events.json.
 *
 * Also repairs past-events.json: entries whose date is still in the future do not
 * belong in the archive (they made the "already a past event" guard drop upcoming
 * events), so they are moved back to staging to be processed again.
 *
 * Reads every file fresh from disk: the arrays passed around in `CityConfig` are
 * snapshots taken at the start of a run, so merging from them can resurrect events
 * that were just cleared.
 *
 * Returns the staging events that remain.
 */
export const deleteOldEvents = (cityName: string): ScrapedEvent[] => {
  const now = new Date();

  const staging = readEventFile(cityName, "staging-events.json") ?? [];
  const { past: pastStaging, upcoming: upcomingStaging } = partitionPastAndUpcoming(staging, now);

  console.log(`Removing ${pastStaging.length} old events from staging-events (${upcomingStaging.length} remain).`);

  const completeEvents = readEventFile(cityName, "complete-events.json") ?? [];
  const { past: pastComplete, upcoming: upcomingComplete } = partitionPastAndUpcoming(completeEvents, now);

  const incompleteEvents = readEventFile(cityName, "incomplete-events.json") ?? [];
  const { past: pastIncomplete, upcoming: upcomingIncomplete } = partitionPastAndUpcoming(incompleteEvents, now);

  const pastEvents = readEventFile(cityName, "past-events.json") ?? [];
  const misplacedPastEvents = pastEvents.filter((event) => event.eventDateTime && !isPastEvent(event, now));
  const archivedEvents = pastEvents.filter((event) => !misplacedPastEvents.includes(event));

  // Only re-queue misplaced events that are not already waiting in staging/complete.
  const knownKeys = new Set([...upcomingStaging, ...upcomingComplete].map(eventKey));
  const requeuedEvents = misplacedPastEvents.filter((event) => {
    const key = eventKey(event);
    if (knownKeys.has(key)) return false;
    knownKeys.add(key);
    return true;
  });

  const nextStaging = [...upcomingStaging, ...requeuedEvents];

  if (pastStaging.length || requeuedEvents.length) {
    writeWithFallback(
      getEventFilePath(cityName, "staging-events.json"),
      JSON.stringify(nextStaging),
      `Old events removed from staging-events (${nextStaging.length} remain).`,
    );
  }

  if (misplacedPastEvents.length) {
    console.log(
      `Moving ${misplacedPastEvents.length} future-dated events out of past-events (${requeuedEvents.length} re-queued to staging).`,
    );
  }

  const knownPastKeys = new Set(archivedEvents.map(eventKey));
  const finishedEvents = [...pastComplete, ...pastIncomplete];
  const additions = finishedEvents.filter((event) => {
    const key = eventKey(event);
    if (knownPastKeys.has(key)) return false;
    knownPastKeys.add(key);
    return true;
  });

  if (finishedEvents.length || misplacedPastEvents.length) {
    if (pastComplete.length) {
      console.log(
        `Moving ${pastComplete.length} old events from complete-events to past-events (${upcomingComplete.length} remain).`,
      );
    }
    if (pastIncomplete.length) {
      console.log(
        `Moving ${pastIncomplete.length} old events from incomplete-events to past-events (${upcomingIncomplete.length} remain).`,
      );
    }

    writeWithFallback(
      getEventFilePath(cityName, "past-events.json"),
      JSON.stringify([...archivedEvents, ...additions]),
      `${additions.length} old events added to past-events.`,
    );
  } else {
    console.log(`No events needed to be removed from complete/incomplete-events.`);
  }

  if (pastComplete.length) {
    writeWithFallback(
      getEventFilePath(cityName, "complete-events.json"),
      JSON.stringify(upcomingComplete),
      `Old events removed from complete-events.`,
    );
  }

  if (pastIncomplete.length) {
    writeWithFallback(
      getEventFilePath(cityName, "incomplete-events.json"),
      JSON.stringify(upcomingIncomplete),
      `Old events removed from incomplete-events.`,
    );
  }

  return nextStaging;
};
