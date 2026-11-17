import { Type } from "@google/genai";
import { ScrapedEvent } from "../../scrappers/types";
import { googleGenClient } from "../../apis/geminiAiApi";
import { DateTime } from "luxon";

function coordsMatch(a: number[] | undefined, b: number[] | undefined, tolerance: number): boolean {
  if (!a || !b || a.length < 2 || b.length < 2) return false;
  return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;
}

function sameDate(dateA: string | undefined, dateB: string | undefined): boolean {
  if (!dateA || !dateB) return false;
  const a = DateTime.fromISO(dateA).startOf("day");
  const b = DateTime.fromISO(dateB).startOf("day");
  if (!a.isValid || !b.isValid) return false;
  return a.equals(b);
}

function addressMatches(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase().trim() === b.toLowerCase().trim();
}

const normaliseText = (value: string | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokenSet = (value: string | undefined) => new Set(normaliseText(value).split(" ").filter(Boolean));

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
}

/**
 * Whether two event names describe the same event.
 *
 * Only near-identical names count: dense venues list several different events at the
 * same address on the same night ("[UNHINGED] Fridays" vs "Ultimate Fridays"), so a
 * partial word overlap must go to the AI rather than be treated as a duplicate.
 */
export function namesAreSimilar(a: string | undefined, b: string | undefined): boolean {
  const normA = normaliseText(a);
  const normB = normaliseText(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const shorter = normA.length <= normB.length ? normA : normB;
  const longer = normA.length <= normB.length ? normB : normA;
  if (shorter.length >= 8 && longer.includes(shorter)) return true;

  return jaccard(tokenSet(normA), tokenSet(normB)) >= 0.85;
}

/** Venue names ignore leading articles, joining words and punctuation ("The Stag & Hunter Hotel" ~ "Stag and Hunter Hotel"). */
export function venuesAreSimilar(a: string | undefined, b: string | undefined): boolean {
  const stopWords = new Set(["the", "a", "an", "and", "of", "at", "in", "on"]);
  const venueTokens = (value: string | undefined) =>
    new Set([...tokenSet(value)].filter((token) => !stopWords.has(token)));

  const tokensA = venueTokens(a);
  const tokensB = venueTokens(b);
  if (tokensA.size === 0 || tokensB.size === 0) return false;

  return jaccard(tokensA, tokensB) >= 0.8;
}

type DedupResponse = {
  isSameEvent: boolean;
};

const dedupSchema = {
  type: Type.OBJECT,
  properties: {
    isSameEvent: {
      type: Type.BOOLEAN,
      description: "Whether the two events are the same event at the same venue on the same date",
    },
  },
  required: ["isSameEvent"],
};

export type DedupResult = {
  dedupedEvents: ScrapedEvent[];
  removedEvents: ScrapedEvent[];
};

export const aiDedupCompleteEvents = async (events: ScrapedEvent[]): Promise<DedupResult> => {
  if (events.length === 0) {
    return { dedupedEvents: [], removedEvents: [] };
  }

  const removedIndexes = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    if (removedIndexes.has(i)) continue;

    for (let j = i + 1; j < events.length; j++) {
      if (removedIndexes.has(j)) continue;

      const eventA = events[i];
      const eventB = events[j];

      if (!sameDate(eventA.eventDateTime, eventB.eventDateTime)) continue;

      // Same night, same venue: within ~110m, an identical address string, or the same venue name.
      const sameVenue =
        coordsMatch(eventA.lngLat, eventB.lngLat, 0.001) ||
        addressMatches(eventA.venueAddress, eventB.venueAddress) ||
        venuesAreSimilar(eventA.venueName, eventB.venueName);

      // Wider ~550m net catches the same event geocoded slightly differently.
      const nearbyVenue = coordsMatch(eventA.lngLat, eventB.lngLat, 0.005);

      let isSameEvent = false;

      if (sameVenue && namesAreSimilar(eventA.eventName, eventB.eventName)) {
        // Identical names at the same venue on the same date - no need to ask the AI.
        isSameEvent = true;
      } else if (sameVenue || nearbyVenue) {
        // Same venue (or a geocoding wobble) but different billing: let the AI decide.
        const prompt = [
          {
            text: `Are these two events the same event at the same venue on the same date?

            Event A (source: ${eventA.source}):
            - Name: "${eventA.eventName}"
            - Venue: "${eventA.venueName}"
            - Address: "${eventA.venueAddress}"
            - Date: "${eventA.eventDateTime}"
            - Coordinates: [${eventA.lngLat}]

            Event B (source: ${eventB.source}):
            - Name: "${eventB.eventName}"
            - Venue: "${eventB.venueName}"
            - Address: "${eventB.venueAddress}"
            - Date: "${eventB.eventDateTime}"
            - Coordinates: [${eventB.lngLat}]

            Different event names at the same venue on the same night are usually different events.`,
          },
        ];

        const aiRes = await googleGenClient<DedupResponse>(prompt, dedupSchema);
        isSameEvent = aiRes?.isSameEvent === true;
      }

      if (isSameEvent) {
        const aIsWhList = eventA.source === "whList";
        const bIsWhList = eventB.source === "whList";

        if (aIsWhList !== bIsWhList) {
          removedIndexes.add(aIsWhList ? i : j);
        } else {
          removedIndexes.add(j);
        }
      }
    }
  }

  const dedupedEvents: ScrapedEvent[] = [];
  const removedEvents: ScrapedEvent[] = [];

  for (let i = 0; i < events.length; i++) {
    if (removedIndexes.has(i)) {
      console.log(`${events[i].eventName} has a similar scrapped one, removing`);
      removedEvents.push(events[i]);
    } else {
      dedupedEvents.push(events[i]);
    }
  }

  console.log(`Dedup: ${dedupedEvents.length} deduped, ${removedEvents.length} removed (${events.length} total)`);

  return { dedupedEvents, removedEvents };
};
