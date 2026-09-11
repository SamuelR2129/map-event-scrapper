import "dotenv/config";
import * as fs from "node:fs";
import path from "path";
import { googleGenClient } from "../apis/geminiAiApi";
import { ScrapedEvent } from "../scrappers/types";
import { aiCoordinateValidation } from "./ai/googleAi";
import { randomUUID } from "crypto";
import { cityConfig } from "../cityConfig";
import { writeToCompleteEventFiles, writeToIncompleteEventFiles, eventFilesDir } from "./writeToFiles";
import { australianDateTimeMapper } from "./australianDateTimeMapper";
import { findKnownAddressAndCoords } from "./findKnownAddressAndCoords";
import { deleteOldEvents } from "./deleteOldEvents";
import { getBrowser } from "./getBrowser";
import { getBandCampMediaIds } from "./getBandCampMediaIds";
import { aiGenerateEventDescription } from "./ai/aiGenerateEventDescription";
import { enrichEventFromGooglePlaces } from "./findAddressAndLngLat";

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

function fileToGenerativePart(filePath: string, mimeType: string) {
  try {
    const fileBytes = fs.readFileSync(filePath);
    const base64Data = fileBytes.toString("base64");
    return {
      inlineData: {
        data: base64Data,
        mimeType: mimeType,
      },
    };
  } catch (e) {
    console.warn(`No image for ${filePath}`);
  }
}

export const extractEventData = async (imagePart: {
  inlineData: {
    data: string;
    mimeType: string;
  };
}) => {
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
              items: {
                type: "number",
              },
            },
            ticketCost: {
              type: "string",
              description: "The cost of the ticket (e.g., '20.00').",
            },
            genres: {
              type: "string",
              description: "A list of all genres or descriptors, seperated by a comma, uppercased liked Techno, House.",
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
            3. Missing Data: The image lists venue names but not their addresses or coordinates. You must use your internal knowledge to identify the correct venue in Newcastle, NSW, and provide the address and [Longitude, Latitude].

        Instructions:
            1. Extract all events listed under the selected tab.
            2. For 'ticketCost', if the price is listed (e.g. "Clarendon Hotel - $15"), extract it. If it says "FREE" in the genres, set cost to "0.00". If unknown, leave it as an undefined.
            4. For 'lngLat', provide the precise coordinates for the specific venue.
            5. Genres are the colored ovals such as ROCK or TECHNO
            6. Strictly follow this JSON schema for the output:
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
                            "date": { "type": "string", "description": "DD/MM format" },
                            "lngLat": {
                                "type": "array",
                                "items": { "type": "number" },
                                "minItems": 2,
                                "maxItems": 2
                            },
                            "ticketCost": { "type": "string" },
                            "genres": { "type": "string", "description": "A list of all genres or descriptors, seperated by a comma, uppercased liked Techno, House." }
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
    console.error("aiRes", aiRes);
    throw Error("aiRes is null, no response.text returned by ai api");
  }

  console.log("aiRes", aiRes);
  return aiRes;
};

(async () => {
  let completeEvent: ScrapedEvent[] = [];
  let incompleteEvent: ScrapedEvent[] = [];

  const config = await cityConfig("newcastle");
  deleteOldEvents(config.city.cityName);

  const browser = await getBrowser();
  const page = await browser.newPage();

  for (const day of ["wednesday", "thursday", "friday", "saturday", "sunday"]) {
    const imageFilePath = fs.globSync(path.join(eventFilesDir, "weeklyPhotos", `${day}*.png`))[0];

    const imagePart = imageFilePath && fileToGenerativePart(imageFilePath, "image/png");

    if (!imagePart) {
      console.log(`No image for ${day}`);
      continue;
    }

    const data = await extractEventData(imagePart);

    for (const imgEvent of data.events) {
      if (!imgEvent.lngLat) {
        incompleteEvent.push(imgEvent);
        continue;
      }

      const knownVenueEvent = findKnownAddressAndCoords(imgEvent);

      const { eventBannerImage } = await enrichEventFromGooglePlaces(knownVenueEvent);

      // const aiCheckedEvent =
      //   knownVenueEvent.lngLat && knownVenueEvent.venueAddress
      //     ? knownVenueEvent
      //     : await aiCoordinateValidation(knownVenueEvent);

      const aiCheckedEvent = knownVenueEvent;

      const eventDateTime = australianDateTimeMapper(day);

      const bandCampMediaIds = aiCheckedEvent?.eventName
        ? await getBandCampMediaIds(page, "whList", aiCheckedEvent.eventName, aiCheckedEvent.genres)
        : undefined;

      const aiDescription = await aiGenerateEventDescription(imgEvent);

      const mappedGenres = aiCheckedEvent?.genres
        ?.split(", ")
        .filter((genre) => genre !== "WITCHHOUSE SELECT")
        .toString();

      completeEvent.push({
        ...aiCheckedEvent,
        genres: mappedGenres,
        id: randomUUID(),
        userName: "sam",
        userEmail: "sam@hotmail.com",
        localTimeZone: "Australia/Sydney",
        eventDateTime,
        source: "whList",
        bandCampMediaIds: bandCampMediaIds?.[0],
        eventDescription: aiDescription,
        eventBannerImage,
      });
    }
  }

  await page.close();

  const removedEvents = await writeToCompleteEventFiles(completeEvent, config);
  writeToIncompleteEventFiles([...incompleteEvent, ...removedEvents], config);
  process.exit(0);
})();
