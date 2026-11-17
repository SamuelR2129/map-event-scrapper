import { ScrapedEvent } from "../scrappers/types";

/** True when the event has a parseable date that has already passed. Undated/invalid dates are not past. */
export const isPastDateTime = (eventDateTime: string | undefined, now = new Date()) =>
  !!eventDateTime && new Date(eventDateTime) < now;

export const isPastEvent = (event: ScrapedEvent, now = new Date()) => isPastDateTime(event.eventDateTime, now);

/** Latest instant we treat as "not yet started" - events starting exactly now are still upcoming. */
export const isUpcomingDateTime = (eventDateTime: string | undefined, now = new Date()) =>
  !!eventDateTime && !isPastDateTime(eventDateTime, now);

/**
 * Split events into those already finished and those still to come.
 * Events without a usable `eventDateTime` are kept as upcoming so they are never silently dropped.
 */
export const partitionPastAndUpcoming = (events: ScrapedEvent[], now = new Date()) => {
  const past: ScrapedEvent[] = [];
  const upcoming: ScrapedEvent[] = [];

  for (const event of events) {
    (isPastEvent(event, now) ? past : upcoming).push(event);
  }

  return { past, upcoming };
};
