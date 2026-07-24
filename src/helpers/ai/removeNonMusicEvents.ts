import { Type } from "@google/genai";
import { ScrapedEvent } from "../../scrappers/types";
import { googleGenClient } from "../../apis/geminiAiApi";

type BatchFilterResponse = {
  musicIndices: number[];
};

const batchFilterSchema = {
  type: Type.OBJECT,
  properties: {
    musicIndices: {
      type: Type.ARRAY,
      items: { type: Type.NUMBER },
      description: "0-based indices of events that are music events",
    },
  },
  required: ["musicIndices"],
};

export type MusicFilterResult = {
  musicEvents: ScrapedEvent[];
  nonMusicEvents: ScrapedEvent[];
};

export const aiRemoveNonMusicEvents = async (events: ScrapedEvent[]): Promise<MusicFilterResult> => {
  const batchSize = 50;
  const musicIndices = new Set<number>();

  for (let start = 0; start < events.length; start += batchSize) {
    const batch = events.slice(start, start + batchSize);
    const batchEntry = batch.map(
      (e, i) =>
        `${i}: "${e.eventName ?? "unknown"}" | venue: ${e.venueName ?? "unknown"} | genres: ${e.genres ?? "unknown"} | source: ${e.source ?? "unknown"}`,
    );

    const prompt = [
      {
        text: `Classify which of these events are music events (live music, DJ sets, music festivals, album launches, concert tours).

Not music: trivia, comedy, markets, bingo, karaoke, circus, dance classes, art exhibitions, workshops, yoga, wine tasting, brunch, theatre plays, film screenings, walking tours, school events, weddings, birdwatching, boxing/UFC, zine events, poetry slams (unless musical), social meetups.

Events:
${batchEntry.join("\n")}

Return the 0-based indices of events that ARE music events.`,
      },
    ];

    const aiRes = await googleGenClient<BatchFilterResponse>(prompt, batchFilterSchema);
    if (!aiRes) {
      console.warn("AI returned null for batch, keeping all events in this batch");
      for (let j = 0; j < batch.length; j++) musicIndices.add(start + j);
      continue;
    }

    for (const idx of aiRes.musicIndices) {
      if (idx >= 0 && idx < batch.length) {
        musicIndices.add(start + idx);
      }
    }
  }

  const musicEvents: ScrapedEvent[] = [];
  const nonMusicEvents: ScrapedEvent[] = [];

  for (let i = 0; i < events.length; i++) {
    if (musicIndices.has(i)) {
      musicEvents.push(events[i]);
    } else {
      console.log(`${events[i].eventName} is not a music event, removing`);
      nonMusicEvents.push(events[i]);
    }
  }

  console.log(
    `AI music filter: ${musicEvents.length} music, ${nonMusicEvents.length} non-music out of ${events.length} total`,
  );
  return { musicEvents, nonMusicEvents };
};
