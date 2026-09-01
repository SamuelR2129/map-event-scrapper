import stagingEvents from "../eventFiles/newcastle/staging-events.json";
import completeEvents from "../eventFiles/newcastle/complete-events.json";
import pastEvents from "../eventFiles/newcastle/past-events.json";
import { ScrapedEvent } from "../scrappers/types";
import { writeWithFallback, getEventFilePath } from "./writeToFiles";

export const deleteOldEvents = (cityName: string) => {
  const lastStagingEvent = stagingEvents[stagingEvents.length - 1] as ScrapedEvent;

  console.log("Removing events on staging from ", lastStagingEvent?.eventDateTime);

  if (lastStagingEvent?.eventDateTime && new Date(lastStagingEvent.eventDateTime) < new Date()) {
    writeWithFallback(
      getEventFilePath(cityName, "staging-events.json"),
      [].toString(),
      `Old events removed from staging-events.`,
    );
  }

  const lastCompleteEvent: ScrapedEvent = completeEvents[completeEvents.length - 1];

  const writeToPastEvents = lastCompleteEvent?.eventDateTime && new Date(lastCompleteEvent.eventDateTime) < new Date();

  if (writeToPastEvents) {
    console.log(
      `Last eventDateTime in completed file - ${lastCompleteEvent?.eventDateTime}, Will write completed events to past events? - ${writeToPastEvents}`,
    );
    writeWithFallback(
      getEventFilePath(cityName, "past-events.json"),
      JSON.stringify([...pastEvents, ...completeEvents]),
      `${completeEvents.length} old events added to past-events.`,
    );
  }
  if (lastCompleteEvent) {
    console.log("Removing events on complete from ", lastCompleteEvent?.eventDateTime);

    writeWithFallback(
      getEventFilePath(cityName, "complete-events.json"),
      JSON.stringify([]),
      `Old events removed from complete-events.`,
    );
  } else {
    console.log(`No events needed to be removed from complete-events.`);
  }
};
