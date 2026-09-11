import * as fs from "fs";
import * as path from "path";
import { CityConfig } from "../cityConfig";
import { ScrapedEvent } from "../scrappers/types";
import { aiDedupCompleteEvents } from "./ai/dedupCompleteEvents";

export const eventFilesDir = path.join(__dirname, "..", "eventFiles");

export const getEventFilePath = (cityName: string, fileName: string) =>
  path.join(eventFilesDir, cityName, fileName);

export function writeWithFallback(filePath: string, data: string, successMsg: string) {
  const dir = path.dirname(filePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, data);
    console.log(successMsg);
  } catch (err) {
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const fallbackPath = path.join(dir, `${base}-failed-${Date.now()}${ext}`);
    try {
      fs.writeFileSync(fallbackPath, data);
      console.log(`Primary write failed, data saved to fallback: ${fallbackPath}`);
    } catch (fallbackErr) {
      console.error(`Primary write failed: ${filePath}`, (err as Error).message);
      console.error(`Fallback write also failed: ${fallbackPath}`, (fallbackErr as Error).message);
    }
  }
}

export const writeToIncompleteEventFiles = (incompleteEvents: ScrapedEvent[], config: CityConfig) => {
  const { city, eventFiles } = config;
  const mergedEvents = eventFiles.incomplete.length
    ? [...eventFiles.incomplete, ...incompleteEvents]
    : incompleteEvents;

  writeWithFallback(
    getEventFilePath(city.cityName, "incomplete-events.json"),
    JSON.stringify(mergedEvents),
    `${incompleteEvents.length} events added to incomplete-events for investigation.`,
  );
};

export const writeToCompleteEventFiles = async (completeEvents: ScrapedEvent[], config: CityConfig) => {
  const { city, eventFiles } = config;

  const mergedEvents = eventFiles.complete.length ? [...eventFiles.complete, ...completeEvents] : completeEvents;

  const { dedupedEvents, removedEvents } = await aiDedupCompleteEvents(mergedEvents);

  writeWithFallback(
    getEventFilePath(city.cityName, "complete-events.json"),
    JSON.stringify(dedupedEvents),
    `${dedupedEvents.length} events in complete-events (deduped against existing).`,
  );

  return removedEvents;
};

export const writeToPastEventFiles = (events: ScrapedEvent[], config: CityConfig) => {
  const { city, eventFiles } = config;

  const mergedEvents = eventFiles.complete.length ? [...eventFiles.past, ...events] : events;

  writeWithFallback(
    getEventFilePath(city.cityName, "past-events.json"),
    JSON.stringify(mergedEvents),
    `${events.length} events added to past-events.`,
  );
};
