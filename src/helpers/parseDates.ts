import { DateTime } from "luxon";
import { aiGetDateTime } from "./ai/getDateString";
import { detectPromptInjection } from "./ai/promptInjectionDetector";

export const parseDate = async (dateStr: string) => {
  dateStr = dateStr.replace(/^Starts on /, "");
  dateStr = dateStr.replace("ampm", "am");
  dateStr = dateStr.replace("pmam", "pm");
  dateStr = dateStr.replace("Ampm", "am");
  dateStr = dateStr.replace("Pmam", "pm");
  dateStr = dateStr.replace("amPm", "am");
  dateStr = dateStr.replace("pmAm", "pm");

  const strategies = [
    () => DateTime.fromRFC2822(dateStr),
    () => DateTime.fromHTTP(dateStr),

    () => DateTime.fromFormat(dateStr, "cccc, MMMM d ha z"),
    () => DateTime.fromFormat(dateStr, "cccc, MMMM d h:mma z"),
    () => DateTime.fromFormat(dateStr, "cccc, MMMM d h:mm a z"),
    () => DateTime.fromFormat(dateStr, "EEEE, MMMM d ha z"),
    () => DateTime.fromFormat(dateStr, "EEEE, MMMM d h:mma z"),

    () => DateTime.fromFormat(dateStr, "cccc, MMMM d ha"),
    () => DateTime.fromFormat(dateStr, "cccc, MMMM d h:mma"),
    () => DateTime.fromFormat(dateStr, "cccc, MMMM d h:mm a"),
    () => DateTime.fromFormat(dateStr, "EEEE, MMMM d ha"),
    () => DateTime.fromFormat(dateStr, "EEEE, MMMM d h:mma"),

    () => DateTime.fromFormat(dateStr, "MMMM d h:mma"),
    () => DateTime.fromFormat(dateStr, "MMMM d h:mm a"),
    () => DateTime.fromFormat(dateStr, "MMMM d ha"),

    () => DateTime.fromFormat(dateStr, "MMMM d yyyy h:mma"),
    () => DateTime.fromFormat(dateStr, "MMMM d yyyy h:mm a"),

    () => DateTime.fromFormat(dateStr, "ccc, d MMM yyyy h:mm a"),
    () => DateTime.fromFormat(dateStr, "EEE, d MMM yyyy h:mm a"),
    () => DateTime.fromFormat(dateStr, "ccc, d MMM yyyy h:mm a z"),
    () => DateTime.fromFormat(dateStr, "EEE, d MMM yyyy h:mm a z"),
    () => DateTime.fromFormat(dateStr, "LLLL d ha", { zone: "Australia/Sydney", locale: "en-AU" }),
    () => DateTime.fromFormat(dateStr.replace(/ [A-Z]{3,4}$/, ""), "ccc, d MMM yyyy h:mm a"),
  ];

  for (const strategy of strategies) {
    const parsed = strategy();
    if (parsed.isValid) {
      return parsed;
    }
  }

  console.log("\n=== MANUAL TIMEZONE APPROACH ===");
  let withoutTz = dateStr.replace(/ AEST$/, "");
  withoutTz = dateStr.replace(/ AEDT$/, "");
  const parsedLocal = DateTime.fromFormat(withoutTz, "cccc, MMMM d ha").set({ year: 2026 });

  if (parsedLocal.isValid) return parsedLocal;

  const injectionCheck = detectPromptInjection(dateStr);
  if (injectionCheck.detected) {
    console.warn(`Skipping AI date extraction for "${dateStr}" - prompt injection detected:`, injectionCheck.matches);
    return;
  }

  const aiDateString = await aiGetDateTime(dateStr);

  if (aiDateString?.isValid) return aiDateString;

  return;
};
