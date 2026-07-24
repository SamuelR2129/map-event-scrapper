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
  const whListIndexes = new Set<number>();
  const nonWhList: ScrapedEvent[] = [];

  for (let i = 0; i < events.length; i++) {
    if (events[i].source === "whList") {
      whListIndexes.add(i);
    } else {
      nonWhList.push(events[i]);
    }
  }

  if (whListIndexes.size === 0) {
    return { dedupedEvents: events, removedEvents: [] };
  }

  const removedIndexes = new Set<number>();

  for (const whIdx of whListIndexes) {
    const whEvent = events[whIdx];
    let matched = false;

    for (const other of nonWhList) {
      if (!sameDate(whEvent.eventDateTime, other.eventDateTime)) continue;

      const coordsClose = coordsMatch(whEvent.lngLat, other.lngLat, 0.001);

      if (coordsClose && addressMatches(whEvent.venueAddress, other.venueAddress)) {
        matched = true;
        break;
      }

      const coordsFuzzy = coordsMatch(whEvent.lngLat, other.lngLat, 0.005);

      if (coordsFuzzy || addressMatches(whEvent.venueAddress, other.venueAddress)) {
        const prompt = [
          {
            text: `Are these two events the same event at the same venue on the same date?

              Event A (source: ${whEvent.source}):
              - Name: "${whEvent.eventName}"
              - Venue: "${whEvent.venueName}"
              - Address: "${whEvent.venueAddress}"
              - Date: "${whEvent.eventDateTime}"
              - Coordinates: [${whEvent.lngLat}]

              Event B (source: ${other.source}):
              - Name: "${other.eventName}"
              - Venue: "${other.venueName}"
              - Address: "${other.venueAddress}"
              - Date: "${other.eventDateTime}"
              - Coordinates: [${other.lngLat}]`,
          },
        ];

        const aiRes = await googleGenClient<DedupResponse>(prompt, dedupSchema);

        if (aiRes?.isSameEvent) {
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      removedIndexes.add(whIdx);
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
