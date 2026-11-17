import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { clearEventFile, writeToIncompleteEventFiles, eventFilesDir, getEventFilePath } from "./writeToFiles";
import { CityConfig } from "../cityConfig";
import { ScrapedEvent } from "../scrappers/types";

const event = (eventName: string): ScrapedEvent => ({ eventName, eventDateTime: "2026-12-01T09:00:00.000Z" });

test.describe("writeToIncompleteEventFiles", () => {
  let cityName: string;
  let config: CityConfig;

  const read = (): ScrapedEvent[] => JSON.parse(fs.readFileSync(getEventFilePath(cityName, "incomplete-events.json"), "utf8"));
  const write = (events: ScrapedEvent[]) =>
    fs.writeFileSync(getEventFilePath(cityName, "incomplete-events.json"), JSON.stringify(events));

  test.beforeEach(() => {
    cityName = `zz-test-${randomUUID()}`;
    fs.mkdirSync(path.join(eventFilesDir, cityName), { recursive: true });
    config = {
      city: { cityName, displayCityName: "Temp", lat: "0", long: "0" },
      eventFiles: { complete: [], incomplete: [], past: [], staging: [] },
    };
  });

  test.afterEach(() => {
    fs.rmSync(path.join(eventFilesDir, cityName), { recursive: true, force: true });
  });

  test("appends to whatever is already on disk by default", () => {
    write([event("old")]);

    writeToIncompleteEventFiles([event("new")], config);

    expect(read().map((e) => e.eventName)).toEqual(["old", "new"]);
  });

  test("replaces the file contents in replace mode", () => {
    write([event("stale")]);

    writeToIncompleteEventFiles([event("new")], config, "replace");

    expect(read().map((e) => e.eventName)).toEqual(["new"]);
  });

  test("writes an empty array in replace mode when nothing failed", () => {
    write([event("stale")]);

    writeToIncompleteEventFiles([], config, "replace");

    expect(read()).toEqual([]);
  });
});

test.describe("clearEventFile", () => {
  test("replaces the file contents with a valid empty JSON array", () => {
    const cityName = `zz-test-${randomUUID()}`;
    const dir = path.join(eventFilesDir, cityName);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = getEventFilePath(cityName, "staging-events.json");
    fs.writeFileSync(filePath, JSON.stringify([event("queued")]));

    clearEventFile(cityName, "staging-events.json", "cleared");

    expect(fs.readFileSync(filePath, "utf8")).toBe("[]");
    expect(JSON.parse(fs.readFileSync(filePath, "utf8"))).toEqual([]);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
