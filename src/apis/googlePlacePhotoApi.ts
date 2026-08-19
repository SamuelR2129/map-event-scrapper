import dotenv from "dotenv";
dotenv.config();

export const googlePlacePhotoApi = async (photoName: string) => {
  const baseUrl = process.env.GOOGLE_PLACES_URL;
  if (!baseUrl) throw new Error("GOOGLE_PLACES_URL is not set");
  const apiKey = process.env.GOOGLE_PLACES_API_SECRET;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_SECRET is not set");

  const v1Base = new URL(baseUrl).origin + "/v1/";
  const url = new URL(`${v1Base}${photoName}/media`);
  url.searchParams.set("maxWidthPx", "1200");
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Google Place Photo API error: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error("Google Place Photo API request failed:", error);
    throw error;
  }
};