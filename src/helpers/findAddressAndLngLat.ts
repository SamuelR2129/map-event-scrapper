import { googleGeocodingApi } from "../apis/googleGeocodingApi";
import { googlePlacesApi } from "../apis/googlePlacesApi";
import { googlePlacePhotoApi } from "../apis/googlePlacePhotoApi";
import { uploadImageToCloudinary } from "./uploadImageToCloudinary";
import { ScrapedEvent } from "../scrappers/types";

type MissingInfo = {
  genres?: string;
  lngLat?: number[];
  venueAddress?: string;
  eventBannerImage?: string;
};

export const enrichEventFromGooglePlaces = async (event: ScrapedEvent): Promise<MissingInfo> => {
  if (!event.venueName) return {};
  const result = await googlePlacesApi(event.venueName);
  if (!result) return {};

  const { location, formattedAddress, photoName } = result;

  const missingInfo: MissingInfo = {
    lngLat: location?.longitude && location?.latitude ? [location.longitude, location.latitude] : undefined,
    venueAddress: formattedAddress,
  };

  console.log(`enrichEventFromGooglePlaces: `, {
    location,
    formattedAddress,
    photoName,
  });

  if (photoName && !event.eventBannerImage) {
    const photoDataUri = await googlePlacePhotoApi(photoName);
    const eventId = event.id ?? event.eventName?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? event.venueName;
    const bannerUrl = await uploadImageToCloudinary(photoDataUri, eventId);
    if (bannerUrl) {
      missingInfo.eventBannerImage = bannerUrl;
      console.log(`eventBannerImage set`, bannerUrl);
    } else {
      console.log("No bannerUrl found");
    }
  } else {
    console.log("No photoName or eventBannerImage");
  }

  return missingInfo;
};

export const findMissingAddressAndLngLat = async (event: ScrapedEvent) => {
  let missingInfo: MissingInfo = {};

  if (!event.lngLat && !event.venueAddress && event.venueName) {
    missingInfo = await enrichEventFromGooglePlaces(event);
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
