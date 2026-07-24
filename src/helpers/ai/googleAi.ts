import { Type } from "@google/genai";
import { ScrapedEvent } from "../../scrappers/types";
import { googleGenClient } from "../../apis/geminiAiApi";

export type EventGenresResponse = {
  genres: string;
};

export type EventLngLatResponse = {
  longitude: number;
  latitude: number;
  edited: boolean;
};

const CoordinateResponseSchema = {
  type: Type.OBJECT,
  properties: {
    longitude: {
      type: Type.NUMBER,
      description: "A event longitude",
    },
    latitude: {
      type: Type.NUMBER,
      description: "A event latitude",
    },
    edited: {
      type: Type.BOOLEAN,
      description: "Have the longitude and latitude been edited",
    },
  },
  required: ["longitude", "latitude", "edited"],
};

const GenresResponseSchema = {
  type: Type.OBJECT,
  properties: {
    genres: {
      type: Type.STRING,
      description: "A list of genres",
    },
  },
  required: ["genres"],
};

export const getEventGenresWithAi = async (eventData: ScrapedEvent) => {
  const prompt = [
    {
      text: `
  Given the following event details, identify the primary musical genres of the bands performing.
  Event Name: ${eventData.eventName}
  Venue Location: ${eventData.venueLocation}
  Venue Address: ${eventData.venueAddress} 
  Event Promoters: ${eventData.eventPromoters}
  Event Description: ${eventData.eventDescription}

  Output the genres as a comma-separated string under a 'genres' key in JSON format,  min 1 genre, max 3 genres. 
  Use this genre list
  "jazz",
	"acoustic",
	"alt",
	"punk",
	"metal",
	"folk",
	"indie",
	"rock",
	"hardcore",
	"band",
	"blues",
	"funk",
	"psyc",
	"synthpop",
	"soul",
	"heavy",
	"grunge",
	"country",
	"emo",
	"metalcore",
	"poppunk",
	"club",
	"bass",
	"vinyl",
	"house",
	"techno",
	"dnb",
	"dj",
	"dance",
	"breaks",
	"lofi",
	"disco",
	"prog house",
	"minimal",
	"electro",
	"electronic",
	"afrobeats",
	"ridim",
	"dubstep",
	"rap",
	"pop"
  Example output: {"genres": "Genre1, Genre2"}
  `,
    },
  ];

  try {
    const aiRes = await googleGenClient<EventGenresResponse>(prompt, GenresResponseSchema);
    if (!aiRes) throw Error("aiRes is null, no response.text returned by ai api");

    if (aiRes.genres === "null") return "unknown";
    return aiRes.genres;
  } catch (err) {
    console.error(`getEventGenresWithAi - Error getting event genres for ${eventData.eventName}`, err);
  }
};

export const aiCoordinateValidation = async (eventData: ScrapedEvent) => {
  const prompt = [
    {
      text: `
  Given the event address, event longitude, event latitude and venue name, is the longitude and latitude correct. If not correct, return the new longitude and latitude that correctly matches the address or venue name.
  Venue address and venue name can be undefined, if both are undefined then the provided Longitude and Latitude is correct.
  Longitude and latitude must have the precision of 7 decimal digits.
  Return a boolean value called edited, true if the longitude and latitude are different from the original, false if they were correct and remained the same to the original.

  Event Address: ${eventData.venueAddress}
  Event Longitude and Latitude: ${eventData.lngLat}
  Event Venue name: ${eventData.venueName} 

  Output the longitude and latitude as numbers in a object, and a edited boolean to say if it was edited or not
  Example output: {"longitude": 151.4363373, "latitude": -33.4716186, "edited": true }
  `,
    },
  ];

  try {
    const aiRes = await googleGenClient<EventLngLatResponse>(prompt, CoordinateResponseSchema);
    if (!aiRes) throw Error("aiRes is null, no response.text returned by ai api");

    console.log("aiCoordinateValidation", aiRes);

    if (aiRes.edited) {
      console.log(
        `New lnglat: ${aiRes.longitude} ${aiRes.latitude}, The lnglat for ${eventData.eventName} was incorrect - ${eventData.venueAddress} ${eventData.lngLat} ${eventData.venueName}`,
      );
      return { ...eventData, lngLat: [aiRes.longitude, aiRes.latitude] };
    }

    return eventData;
  } catch (err) {
    console.error(`aiCoordinateValidation - Error getting event lnglat for ${eventData.eventName}`, err);
  }
};
