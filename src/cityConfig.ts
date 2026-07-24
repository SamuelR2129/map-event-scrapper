import { promises as fs } from "fs";
import { ScrapedEvent } from "./scrappers/types";
import path from "path";

export type CityData = {
  cityName: string;
  displayCityName: string;
  lat: string;
  long: string;
};

export interface CityConfig {
  eventFiles: {
    complete: ScrapedEvent[];
    incomplete: ScrapedEvent[];
    past: ScrapedEvent[];
    staging: ScrapedEvent[];
  };
  city: CityData;
}

export const getCityData = (city: string): CityData => {
  switch (city) {
    case "newcastle":
      return {
        cityName: "newcastle",
        displayCityName: "Newcastle",
        lat: "-32.9282712",
        long: "151.7816802",
      };

    case "sydney":
      return {
        cityName: "sydney",
        displayCityName: "Sydney",
        lat: "-33.86785",
        long: "151.20732",
      };

    default:
      throw new Error(`Invalid or missing CITY_CONFIG: ${city}`);
  }
};

export const cityConfig = async (projectName: string): Promise<CityConfig> => {
  const files = {
    complete: "complete-events.json",
    incomplete: "incomplete-events.json",
    past: "past-events.json",
    staging: "staging-events.json",
  };

  const loadJson = async (fileName: string): Promise<ScrapedEvent[]> => {
    const relativePath = path.join(__dirname, "eventFiles", projectName, fileName);
    const content = await fs.readFile(relativePath, "utf8");
    return JSON.parse(content);
  };

  const [complete, incomplete, past, staging] = await Promise.all([
    loadJson(files.complete),
    loadJson(files.incomplete),
    loadJson(files.past),
    loadJson(files.staging),
  ]);

  const eventFiles = { complete, incomplete, past, staging };

  const cityData = getCityData(projectName);

  return { eventFiles, city: cityData };
};
