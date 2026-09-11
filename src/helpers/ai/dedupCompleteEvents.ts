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

      const coordsClose = coordsMatch(eventA.lngLat, eventB.lngLat, 0.001);

      let isSameEvent = false;

      if (coordsClose || addressMatches(eventA.venueAddress, eventB.venueAddress)) {
        isSameEvent = true;
      } else {
        const coordsFuzzy = coordsMatch(eventA.lngLat, eventB.lngLat, 0.005);

        if (coordsFuzzy) {
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
              - Coordinates: [${eventB.lngLat}]`,
            },
          ];

          const aiRes = await googleGenClient<DedupResponse>(prompt, dedupSchema);
          isSameEvent = aiRes?.isSameEvent === true;
        }
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
