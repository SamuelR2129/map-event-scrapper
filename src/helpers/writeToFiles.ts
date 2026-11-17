import * as fs from "fs";
import * as path from "path";
import { CityConfig } from "../cityConfig";
import { ScrapedEvent } from "../scrappers/types";
import { aiDedupCompleteEvents } from "./ai/dedupCompleteEvents";

export const eventFilesDir = path.join(__dirname, "..", "eventFiles");

export const researchDataDir = path.join(__dirname, "..", "..", "researchData");

export const getEventFilePath = (cityName: string, fileName: string) => path.join(eventFilesDir, cityName, fileName);

/**
 * Read an event file from disk. Returns null when the file is missing or unparseable,
 * so callers can fall back instead of throwing.
 */
export const readEventFile = (cityName: string, fileName: string): ScrapedEvent[] | null => {
  try {
    const parsed = JSON.parse(fs.readFileSync(getEventFilePath(cityName, fileName), "utf8"));
    return Array.isArray(parsed) ? (parsed as ScrapedEvent[]) : null;
  } catch {
    return null;
  }
};

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

/**
- Clear an event file, always leaving a valid empty JSON array (`[]`) behind.
- Never write an empty string, or the file becomes invalid JSON and can't be re-imported.
 */
export const clearEventFile = (cityName: string, fileName: string, successMsg: string) => {
  writeWithFallback(getEventFilePath(cityName, fileName), JSON.stringify([]), successMsg);
};

export type IncompleteWriteMode = "merge" | "replace";

/**
 * Write the events that could not be completed.
 *
 * `replace` makes the file reflect only the current run, so a map run does not
 * accumulate stale investigation entries from previous runs.
 */
export const writeToIncompleteEventFiles = (
  incompleteEvents: ScrapedEvent[],
  config: CityConfig,
  mode: IncompleteWriteMode = "merge",
) => {
  const { city, eventFiles } = config;

  const existing =
    mode === "replace" ? [] : (readEventFile(city.cityName, "incomplete-events.json") ?? eventFiles.incomplete);

  const mergedEvents = existing.length ? [...existing, ...incompleteEvents] : incompleteEvents;

  writeWithFallback(
    getEventFilePath(city.cityName, "incomplete-events.json"),
    JSON.stringify(mergedEvents),
    mode === "replace"
      ? `${incompleteEvents.length} events written to incomplete-events for investigation.`
      : `${incompleteEvents.length} events added to incomplete-events for investigation.`,
  );
};

export const writeToCompleteEventFiles = async (completeEvents: ScrapedEvent[], config: CityConfig) => {
  const { city, eventFiles } = config;

  // Read from disk so events pruned by deleteOldEvents are not re-added from the
  // start-of-run snapshot held in `config.eventFiles`.
  const existing = readEventFile(city.cityName, "complete-events.json") ?? eventFiles.complete;

  const mergedEvents = existing.length ? [...existing, ...completeEvents] : completeEvents;

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

  const existing = readEventFile(city.cityName, "past-events.json") ?? eventFiles.past;

  const mergedEvents = existing.length ? [...existing, ...events] : events;

  writeWithFallback(
    getEventFilePath(city.cityName, "past-events.json"),
    JSON.stringify(mergedEvents),
    `${events.length} events added to past-events.`,
  );
};

export type ResearchData = {
  processedImages: string[];
  events: ScrapedEvent[];
};

export const getResearchFileName = (date = new Date()) => {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `events-${stamp}.json`;
};

export const getResearchFilePath = (fileName: string) => path.join(researchDataDir, fileName);

export const processedImagesPath = path.join(researchDataDir, "processed-images.json");

export const readResearchData = (fileName: string): ResearchData => {
  try {
    const parsed = JSON.parse(fs.readFileSync(getResearchFilePath(fileName), "utf8"));
    const allEvents: ScrapedEvent[] = Array.isArray(parsed.events) ? parsed.events : [];

    return {
      processedImages: Array.isArray(parsed.processedImages) ? parsed.processedImages : [],
      events: allEvents,
    };
  } catch {
    return { processedImages: [], events: [] };
  }
};

export const writeResearchData = (fileName: string, data: ResearchData) => {
  writeWithFallback(
    getResearchFilePath(fileName),
    JSON.stringify(data, null, 2),
    `${data.events.length} events written to researchData/${fileName}.`,
  );
};

export const readProcessedImages = (): string[] => {
  try {
    const parsed = JSON.parse(fs.readFileSync(processedImagesPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const writeProcessedImages = (imagePaths: string[]) => {
  writeWithFallback(
    processedImagesPath,
    JSON.stringify(imagePaths, null, 2),
    `${imagePaths.length} processed image(s) recorded.`,
  );
};
