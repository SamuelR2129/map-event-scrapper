import { Type } from "@google/genai";
import { googleGenClient } from "../../apis/geminiAiApi";
import { ScrapedEvent } from "../../scrappers/types";

export type EventDescriptionResponse = {
  description: string;
};

const DescriptionResponseSchema = {
  type: Type.OBJECT,
  properties: {
    description: {
      type: Type.STRING,
      description: "A punchy, human-sounding description of the music event",
    },
  },
  required: ["description"],
};

export const aiGenerateEventDescription = async (eventData: ScrapedEvent): Promise<string | undefined> => {
  const prompt = [
    {
      text: `
      Act as a local music journalist for Witchhouse, a DIY event directory.
      Write a punchy, 3-4 sentence description for this gig.

      Rules:
      - No AI buzzwords: avoid 'vibrant', 'tapestry', 'unforgettable', or 'experience'.
      - Focus on the music: describe the sound (e.g., 'gritty punk', 'soulful indie').
      - Tone: Casual, like a text to a mate.
      
      Event: ${eventData.eventName}
      Venue: ${eventData.venueName}
      Genres: ${eventData.genres}

      Return a JSON object with a single key: "description".
      `,
    },
  ];

  try {
    const aiRes = await googleGenClient<EventDescriptionResponse>(prompt, DescriptionResponseSchema);

    if (!aiRes?.description) throw Error("No description returned");

    return aiRes.description;
  } catch (err) {
    console.error(`Description failed for ${eventData.eventName}`, err);
  }
};
