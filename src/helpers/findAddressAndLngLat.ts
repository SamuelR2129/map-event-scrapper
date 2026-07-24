import { googleGeocodingApi } from "../apis/googleGeocodingApi";
import { googlePlacesApi } from "../apis/googlePlacesApi";
import { ScrapedEvent } from "../scrappers/types";

export const findMissingAddressAndLngLat = async (event: ScrapedEvent) => {
  let missingInfo: {
    genres?: string;
    lngLat?: number[];
    venueAddress?: string;
  } = {};

  if (!event.lngLat && !event.venueAddress && event.venueName) {
    const result = await googlePlacesApi(event.venueName);

    if (result) {
      const { location, formattedAddress } = result;
      missingInfo = {
        ...missingInfo,
        lngLat: location?.longitude && location?.latitude ? [location.longitude, location.latitude] : undefined,
        venueAddress: formattedAddress,
      };
    }
  } else if (event.lngLat && !event.venueAddress) {
    const foundAddress = await googleGeocodingApi({ lat: event.lngLat[1], lng: event.lngLat[0] });

    missingInfo = {
      ...missingInfo,
      venueAddress: foundAddress.formattedAddress,
    };
  } else if (event.venueAddress && !event.lngLat) {
    const foundLocation = await googleGeocodingApi({ address: event.venueAddress });

    const { location } = foundLocation;
    missingInfo = {
      ...missingInfo,
      lngLat: location?.lng && location?.lat ? [location.lng, location.lat] : undefined,
    };
  }

  return { ...event, ...missingInfo };
};
