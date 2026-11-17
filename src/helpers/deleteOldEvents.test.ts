import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { deleteOldEvents } from "./deleteOldEvents";
import { eventFilesDir, getEventFilePath } from "./writeToFiles";
import { ScrapedEvent } from "../scrappers/types";

const past = (eventName: string, eventDateTime: string): ScrapedEvent => ({ eventName, eventDateTime });
const future = (eventName: string, eventDateTime: string): ScrapedEvent => ({ eventName, eventDateTime });

const futureDate = (days = 30) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
const pastDate = (days = 30) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

// Fixed instants so events meant to be identical really are identical.
const FUTURE = futureDate();
const PAST = pastDate();

test.describe("deleteOldEvents", () => {
  let cityName: string;

  const write = (file: string, events: ScrapedEvent[]) =>
    fs.writeFileSync(getEventFilePath(cityName, file), JSON.stringify(events));
  const read = (file: string): ScrapedEvent[] =>
    JSON.parse(fs.readFileSync(getEventFilePath(cityName, file), "utf8"));
  const names = (file: string) => read(file).map((e) => e.eventName);

  test.beforeEach(() => {
    cityName = `zz-test-${randomUUID()}`;
    fs.mkdirSync(path.join(eventFilesDir, cityName), { recursive: true });
  });

  test.afterEach(() => {
    fs.rmSync(path.join(eventFilesDir, cityName), { recursive: true, force: true });
  });

  test("prunes past events from staging and keeps upcoming ones", () => {
    write("staging-events.json", [past("old", pastDate()), future("soon", futureDate())]);
    write("complete-events.json", []);
    write("past-events.json", []);

    deleteOldEvents(cityName);

    expect(names("staging-events.json")).toEqual(["soon"]);
  });

  test("moves finished complete events into past-events", () => {
    write("staging-events.json", []);
    write("complete-events.json", [past("finished", PAST), future("later", futureDate())]);
    write("past-events.json", [past("already archived", pastDate(90))]);

    deleteOldEvents(cityName);

    expect(names("complete-events.json")).toEqual(["later"]);
    expect(names("past-events.json")).toEqual(["already archived", "finished"]);
  });

  test("moves finished incomplete events into past-events", () => {
    write("staging-events.json", []);
    write("complete-events.json", []);
    write("incomplete-events.json", [
      past("failed but finished", PAST),
      future("still to come", FUTURE),
      { eventName: "undated" },
    ]);
    write("past-events.json", [past("already archived", pastDate(90))]);

    deleteOldEvents(cityName);

    expect(names("incomplete-events.json")).toEqual(["still to come", "undated"]);
    expect(names("past-events.json")).toEqual(["already archived", "failed but finished"]);
  });

  test("does not archive an incomplete event twice", () => {
    write("staging-events.json", []);
    write("complete-events.json", []);
    write("incomplete-events.json", [past("finished", PAST)]);
    write("past-events.json", [past("finished", PAST)]);

    deleteOldEvents(cityName);

    expect(names("past-events.json")).toEqual(["finished"]);
    expect(names("incomplete-events.json")).toEqual([]);
  });

  test("does not archive complete events twice", () => {
    write("staging-events.json", []);
    write("complete-events.json", [past("finished", PAST)]);
    write("past-events.json", [past("finished", PAST)]);

    deleteOldEvents(cityName);

    expect(names("past-events.json")).toEqual(["finished"]);
    expect(names("complete-events.json")).toEqual([]);
  });

  test("moves future-dated events out of past-events back into staging", () => {
    write("staging-events.json", []);
    write("complete-events.json", []);
    write("past-events.json", [
      past("archived", pastDate()),
      future("misplaced", FUTURE),
    ]);

    deleteOldEvents(cityName);

    expect(names("past-events.json")).toEqual(["archived"]);
    expect(names("staging-events.json")).toEqual(["misplaced"]);
  });

  test("does not re-queue a misplaced past event that is already in staging", () => {
    write("staging-events.json", [future("misplaced", FUTURE)]);
    write("complete-events.json", []);
    write("past-events.json", [future("misplaced", FUTURE)]);

    deleteOldEvents(cityName);

    expect(names("staging-events.json")).toEqual(["misplaced"]);
    expect(names("past-events.json")).toEqual([]);
  });

  test("leaves undated events alone", () => {
    const undated: ScrapedEvent = { eventName: "no date" };
    write("staging-events.json", [undated]);
    write("complete-events.json", [undated]);
    write("past-events.json", [undated]);

    deleteOldEvents(cityName);

    expect(names("staging-events.json")).toEqual(["no date"]);
    expect(names("complete-events.json")).toEqual(["no date"]);
    expect(names("past-events.json")).toEqual(["no date"]);
  });

  test("tolerates missing files", () => {
    expect(() => deleteOldEvents(cityName)).not.toThrow();
  });
});
