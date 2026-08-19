import dotenv from "dotenv";
dotenv.config();

export const googlePlacesApi = async (textQuery: string) => {
  const baseUrl = process.env.GOOGLE_PLACES_URL;
  if (!baseUrl) throw new Error("GOOGLE_PLACES_URL is not set");
  const apiKey = process.env.GOOGLE_PLACES_API_SECRET;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_SECRET is not set");

  const url = new URL(baseUrl);

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.formattedAddress,places.location,places.photos",
      },
      body: JSON.stringify({
        textQuery,
        locationBias: {
          circle: {
            center: {
              latitude: -32.916668,
              longitude: 151.75,
            },
            radius: 500.0,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data?.places?.length) {
      console.error(`No results found for query: ${textQuery}`);
      return;
    }

    return {
      formattedAddress: data.places[0]?.formattedAddress,
      location: data.places[0]?.location,
      photoName: data.places[0]?.photos?.[0]?.name,
    };
  } catch (error) {
    console.error("Google Places API request failed:", error);
    throw error;
  }
};
