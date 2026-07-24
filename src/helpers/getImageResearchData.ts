import { googleGenClient } from "../apis/geminiAiApi";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ScrapedEvent } from "../scrappers/types";
import { aiCoordinateValidation } from "./ai/googleAi";
import { randomUUID } from "crypto";
import { cityConfig } from "../cityConfig";
import { writeToIncompleteEventFiles, writeToPastEventFiles } from "./writeToFiles";
import { australianDateTimeMapper } from "./australianDateTimeMapper";
import { findKnownAddressAndCoords } from "./findKnownAddressAndCoords";

const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

type ImageFile = {
  filePath: string;
  day: DayOfWeek;
};

type EventResponse = {
  events: {
    eventName: string;
    venueName: string;
    venueAddress: string;
    eventDateTime: string;
    lngLat: [number, number];
    genres: string;
    ticketCost: string;
  }[];
};

function getDayFromFilename(filename: string): DayOfWeek | undefined {
  const lower = filename.toLowerCase();
  return DAYS_OF_WEEK.find((day) => lower.includes(day));
}

function getWeeklyImagesFromDownloads(year: number): ImageFile[] {
  const downloadsDir = path.join(os.homedir(), "Downloads");
  const files = fs.readdirSync(downloadsDir);

  return files.flatMap((file) => {
    if (!/\.(png|jpg|jpeg|webp)$/i.test(file)) return [];

    const day = getDayFromFilename(file);
    if (!day) return [];

    const filePath = path.join(downloadsDir, file);
    const stat = fs.statSync(filePath);

    // birthtime = "Date Added" on macOS
    if (stat.birthtime.getFullYear() !== year) return [];

    return [{ filePath, day }];
  });
}

function fileToGenerativePart(
  filePath: string,
  mimeType: string,
):
  | {
      inlineData: {
        data: string;
        mimeType: string;
      };
    }
  | undefined {
  try {
    const base64Data = fs.readFileSync(filePath).toString("base64");
    return { inlineData: { data: base64Data, mimeType } };
  } catch {
    console.warn(`Could not read image: ${filePath}`);
    return undefined;
  }
}

export const extractEventData = async (imagePart: {
  inlineData: { data: string; mimeType: string };
}): Promise<EventResponse> => {
  const schema = {
    type: "object",
    properties: {
      events: {
        type: "array",
        description: "A list of all unique events shown in the image.",
        items: {
          type: "object",
          properties: {
            eventName: {
              type: "string",
              description: "The name of the artist or event.",
            },
            venueName: {
              type: "string",
              description: "The venue where the event is being held.",
            },
            venueAddress: {
              type: "string",
              description: "The full physical address of the venue.",
            },
            lngLat: {
              type: "array",
              description: "Geographic coordinates in [Longitude, Latitude] format.",
              minItems: 2,
              maxItems: 2,
              items: { type: "number" },
            },
            ticketCost: {
              type: "string",
              description: "The cost of the ticket (e.g., '20.00').",
            },
            genres: {
              type: "string",
              description: "A list of all genres or descriptors, separated by a comma, uppercased like Techno, House.",
            },
          },
          required: ["eventName", "venueName", "venueAddress", "genres"],
        },
      },
    },
    required: ["events"],
  };

  const prompt = [
    {
      text: `
        Analyze the provided image.

        Context:
            1. Location: These events are taking place in Newcastle, NSW, Australia.
            2. Missing Data: The image lists venue names but not their addresses or coordinates. You must use your internal knowledge to identify the correct venue in Newcastle, NSW, and provide the address and [Longitude, Latitude].

        Instructions:
            1. Extract all events listed under the selected tab.
            2. For 'ticketCost', if the price is listed (e.g. "Clarendon Hotel - $15"), extract it. If it says "FREE" in the genres, set cost to "0.00". If unknown, leave it as undefined.
            3. For 'lngLat', provide the precise coordinates for the specific venue.
            4. Genres are the colored ovals such as ROCK or TECHNO.
            5. Strictly follow this JSON schema for the output:
            {
                "type": "object",
                "properties": {
                    "events": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "eventName": { "type": "string" },
                                "venueName": { "type": "string" },
                                "venueAddress": { "type": "string", "description": "Full address including postcode" },
                                "lngLat": {
                                    "type": "array",
                                    "items": { "type": "number" },
                                    "minItems": 2,
                                    "maxItems": 2
                                },
                                "ticketCost": { "type": "string" },
                                "genres": { "type": "string", "description": "Comma-separated, uppercased like Techno, House." }
                            },
                            "required": ["eventName", "venueName", "venueAddress", "lngLat", "genres"]
                        }
                    }
                }
            }
      `,
    },
    imagePart,
  ];

  const aiRes = await googleGenClient<EventResponse>(prompt, schema);
  if (!aiRes) {
    throw new Error("No response returned by AI API");
  }

  console.log("aiRes", aiRes);
  return aiRes;
};

(async () => {
  const completeEvents: ScrapedEvent[] = [];
  const incompleteEvents: ScrapedEvent[] = [];

  const config = await cityConfig("newcastle");
  const imageFiles = getWeeklyImagesFromDownloads(2026);

  if (imageFiles.length === 0) {
    console.warn("No matching weekly images found in Downloads for 2026.");
    return;
  }

  console.log(`Found ${imageFiles.length} image(s) to process.`);

  for (const { filePath, day } of imageFiles) {
    console.log(`Processing: ${filePath} (${day})`);

    const imagePart = fileToGenerativePart(filePath, "image/png");
    if (!imagePart) continue;

    const data = await extractEventData(imagePart);

    for (const imgEvent of data.events) {
      if (!imgEvent.lngLat) {
        incompleteEvents.push(imgEvent);
        continue;
      }

      const knownVenueEvent = findKnownAddressAndCoords(imgEvent);

      const aiCheckedEvent =
        knownVenueEvent.lngLat && knownVenueEvent.venueAddress
          ? knownVenueEvent
          : await aiCoordinateValidation(knownVenueEvent);

      const eventDateTime = australianDateTimeMapper(day);

      completeEvents.push({
        ...aiCheckedEvent,
        id: randomUUID(),
        userName: "sam",
        userEmail: "sam@hotmail.com",
        localTimeZone: "Australia/Sydney",
        eventDateTime,
        source: "whList",
      });
    }
  }

  console.log(`Complete: ${completeEvents.length} | Incomplete: ${incompleteEvents.length}`);

  writeToPastEventFiles(completeEvents, config);
  writeToIncompleteEventFiles(incompleteEvents, config);
})();
