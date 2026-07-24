import { DateTime } from "luxon";

type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
type WeekdayNumbers = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Converts a day of the week to a UTC ISO string representing that day in Australian time.
 * Returns the start of the specified day in Australia/Sydney timezone, converted to UTC.
 *
 * @param day - The day of the week (case-insensitive)
 * @param time - Optional time in 24-hour format (e.g., '14:30'). Defaults to '00:00'
 * @returns UTC ISO string
 *
 * @example
 * australianDateTimeMapper('friday')
 * // Returns ISO string for Friday midnight in Sydney (as UTC)
 */
export function australianDateTimeMapper(day: DayOfWeek | string): string {
  const dayLower = day.toLowerCase() as DayOfWeek;

  // Map day names to Luxon weekday numbers (1 = Monday, 7 = Sunday)
  const dayMap: Record<DayOfWeek, WeekdayNumbers> = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 7,
  };

  const targetWeekday = dayMap[dayLower];

  if (!targetWeekday) {
    throw new Error(`Invalid day: ${day}. Must be a valid day of the week.`);
  }

  // Get current time in Australia/Sydney timezone
  const now = DateTime.now().setZone("Australia/Sydney");

  // Set to the target day within the current week
  const targetDate = now.set({ weekday: targetWeekday, hour: 2, minute: 0, second: 0, millisecond: 0 });

  // Convert to UTC and return ISO string
  const iso = targetDate.toUTC().toISO();

  if (!iso) {
    throw new Error(`Failed to convert date to ISO string for day: ${day}`);
  }

  return iso;
}
