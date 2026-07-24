export const googleGeocodingApi = async ({ lat, lng, address }: { lat?: number; lng?: number; address?: string }) => {
  const baseUrl = process.env.GOOGLE_GEOCODE_URL;
  if (!baseUrl) throw new Error("GOOGLE_GEOCODE_URL is not set");
  const apiKey = process.env.GOOGLE_MAP_API_SECRET;
  if (!apiKey) throw new Error("GOOGLE_MAP_API_SECRET is not set");

  const url = new URL(baseUrl);

  if (lat && lng) url.searchParams.append("latlng", `${lat},${lng}`);
  if (address) url.searchParams.append("address", `${address}`);

  url.searchParams.append("key", apiKey);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Google Geocoding API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.results.length) {
      throw new Error(`No results found for query: ${address ? address : [lat, lng]}`);
    }

    const formattedAddress = data.results[0]?.formatted_address;

    const location = data.results[0]?.geometry?.location;

    return {
      formattedAddress,
      location,
    };
  } catch (error) {
    console.error("Google Reverse Geocoding API request failed:", error);
    throw error;
  }
};
