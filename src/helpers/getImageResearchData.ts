import { googleGenClient } from "../apis/geminiAiApi";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DateTime } from "luxon";
import { ScrapedEvent } from "../scrappers/types";
import { randomUUID } from "crypto";
import {
  getResearchFileName,
  readProcessedImages,
  readResearchData,
  writeProcessedImages,
  writeResearchData,
} from "./writeToFiles";
import { eventsExtractionPrompt, eventsExtractionSchema } from "./extractEventsFromImages";

const DAYS_OF_WEEK = ["wednesday", "thursday", "friday", "saturday", "sunday"] as const;

type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

type WeekdayNumbers = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const DAY_MAP: Record<DayOfWeek, WeekdayNumbers> = {
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

type ImageFile = {
  filePath: string;
  day: DayOfWeek;
  birthtime: Date;
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

    return [{ filePath, day, birthtime: stat.birthtime }];
  });
}

/**
 * Resolves the event date for an image-research photo: the target day of the week
 * within the ISO week (Mon-Sun) of the date the image was saved.
 *
 * Uses the file's local calendar date (birthtime / "Date Added") as the anchor, so the
 * machine timezone never shifts the week.
 *
 * @param day - Day of the week named in the image filename (e.g. 'friday')
 * @param birthtime - When the image was saved
 * @returns UTC ISO string for that day (2am Sydney) of the image's week
 */
export function getImageEventDateTime(day: DayOfWeek, birthtime: Date): string {
  const weekday = DAY_MAP[day];
  if (!weekday) {
    throw new Error(`Invalid day for image research: ${day}. Must be a valid day of the week.`);
  }

  const anchor = DateTime.fromObject(
    {
      year: birthtime.getFullYear(),
      month: birthtime.getMonth() + 1,
      day: birthtime.getDate(),
    },
    { zone: "Australia/Sydney" },
  );

  const target = anchor.set({
    weekday,
    hour: 2,
    minute: 0,
    second: 0,
    millisecond: 0,
  });

  const iso = target.toUTC().toISO();
  if (!iso) {
    throw new Error(`Failed to convert date to ISO string for day: ${day}`);
  }

  return iso;
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
  const prompt = [
    {
      text: eventsExtractionPrompt,
    },
    imagePart,
  ];

  const aiRes = await googleGenClient<EventResponse>(prompt, eventsExtractionSchema);
  if (!aiRes) {
    throw new Error("No response returned by AI API");
  }

  console.log("aiRes", aiRes);
  return aiRes;
};

if (require.main === module) {
  (async () => {
    const fileName = getResearchFileName();
    const existing = readResearchData(fileName);
    const globalProcessed = new Set(readProcessedImages());

    const completeEvents: ScrapedEvent[] = [...existing.events];
    const processedToday: string[] = [...existing.processedImages];

    const allImageFiles = getWeeklyImagesFromDownloads(2026);
    const imageFiles = allImageFiles.filter(({ filePath }) => !globalProcessed.has(filePath));

    if (imageFiles.length === 0) {
      console.warn(
        `No new weekly images to process (${allImageFiles.length} found, all already processed).`,
      );
      return;
    }

    const skipped = allImageFiles.length - imageFiles.length;
    console.log(
      `Found ${allImageFiles.length} image(s); processing ${imageFiles.length}, skipping ${skipped}.`,
    );

    let failed = 0;
    let processedThisRun = 0;

    for (const { filePath, day, birthtime } of imageFiles) {
      console.log(`Processing: ${filePath} (${day})`);

      try {
        const imagePart = fileToGenerativePart(filePath, "image/png");
        if (!imagePart) throw new Error("Could not read image");

        const data = await extractEventData(imagePart);
        const eventDateTime = getImageEventDateTime(day, birthtime);

        for (const imgEvent of data.events) {
          completeEvents.push({
            ...imgEvent,
            id: randomUUID(),
            userName: "sam",
            userEmail: "sam@hotmail.com",
            localTimeZone: "Australia/Sydney",
            eventDateTime,
            source: "whList",
          });
        }

        processedToday.push(filePath);
        globalProcessed.add(filePath);
        processedThisRun++;
      } catch (err) {
        failed++;
        console.error(`Failed to process ${filePath}:`, (err as Error).message);
        continue;
      }

      writeResearchData(fileName, { processedImages: processedToday, events: completeEvents });
      writeProcessedImages([...globalProcessed]);
    }

    console.log(
      `Done. ${processedThisRun} processed this run, ${failed} failed, ${skipped} already processed. ${completeEvents.length} events in researchData/${fileName}.`,
    );
  })();
}
