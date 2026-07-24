import { ScrapedEvent } from "../scrappers/types";
import fs from "fs";
import { getEventFilePath } from "../helpers/writeToFiles";
import "dotenv/config";

const GOD_ACCESS_PASSWORD = "lessssGo2284";

(async () => {
  const city = process.env.PROJECT;

  if (!city) {
    throw new Error("Error: PROJECT environment variable is not set");
  }

  const completeEventsPath = getEventFilePath(city, "complete-events.json");

  if (!fs.existsSync(completeEventsPath)) {
    console.error(`No complete-events.json found for city: ${city}`);
    process.exit(1);
  }

  const events: ScrapedEvent[] = JSON.parse(fs.readFileSync(completeEventsPath, "utf-8"));

  if (events.length === 0) {
    console.log("No events to send.");
    process.exit(0);
  }

  const baseUrl = process.env.PRODUCTION_DB_URL;
  if (!baseUrl) {
    throw new Error("PRODUCTION_DB_URL environment variable is not set");
  }

  const url = `${baseUrl}/map/events/multiple?godAccessPassword=${GOD_ACCESS_PASSWORD}`;

  console.log(`Sending ${events.length} events to ${baseUrl}/map/events/multiple`);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(events),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to send events: ${response.status} ${response.statusText}`);
    console.error(errorText);
    process.exit(1);
  }

  const result = await response.json();
  console.log("Successfully sent events. Response:");
  console.log(JSON.stringify(result, null, 2));
})();
