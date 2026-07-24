import { ScrapedEvent } from "../scrappers/types";
import venueLocations from "./venueLocations.json";

export const findKnownAddressAndCoords = (ev: ScrapedEvent) => {
  const location = venueLocations.find(
    (location) => ev.venueName && location.venueName?.toLowerCase().includes(ev.venueName.toLowerCase()),
  );

  if (!location) {
    if (ev.venueName) {
      console.log("Didn't find pre-existing details for ", ev.venueName);
    } else {
      console.log("Event has no venueName, skipping venue lookup");
    }
    return ev;
  }

  return {
    ...ev,
    venueAddress: location.venueAddress,
    lngLat: location.lngLat,
  };
};
