import { googleGenClient } from "../../apis/geminiAiApi";

const artistUrlResponseSchema = {
  type: "object",
  properties: {
    url: {
      type: "string",
      description: "The full BandCamp URL, e.g., https://name.bandcamp.com/",
    },
    confidenceScore: {
      type: "number",
      description: "Confidence score between 0 and 1",
    },
    artistName: {
      type: "string",
      description: "The name of the artist returned",
    },
    matchReason: {
      type: "string",
      description: "Brief explanation of why this artist matches the genres",
    },
  },
  required: ["url", "confidenceScore", "artistName", "matchReason"],
};

type ArtistUrlResponse = {
  url: string;
  confidenceScore: number;
  artistName: string;
  matchReason: string;
};

export const aiGenerateArtistBandCampUrl = async (artists: string[], failedUrls: string[], genres?: string) => {
  if (!artists.length) return;

  const prompt = [
    {
      text: `
Act as a music discovery bot for a DIY directory.

Your task:
Find a REAL Australian artist on Bandcamp that is NOT in the current lineup and matches a similar style.

Context:
- Current Lineup: ${artists.join(", ")}
- Genres: ${genres}
- Previously Failed URLs (DO NOT reuse): ${failedUrls.join(", ")}

Strict Rules:
1. HARD EXCLUSION: You MUST NOT return any URL from the "Previously Failed URLs" list. Treat them as invalid.
2. FORMAT: URL must be exactly "https://{slug}.bandcamp.com/" (no extra paths or params).
3. EXISTENCE: Only return artists that actually exist AND have released music on Bandcamp.
4. NO DUPLICATES: Do NOT return any artist from this list: ${artists.join(", ")}.
5. VALID PAGE: The URL must resolve to a real artist page — NOT a signup page, empty domain, or redirect (e.g. "/signup?new_domain").
6. CONFIDENCE:
   - High (0.8–1.0): You are confident the page exists and has music.
   - Medium (0.5–0.79): Likely correct but not fully certain.
   - Low (<0.5): Only if unsure — avoid guessing.
7. If confidence Medium or Low, prefer a DIFFERENT artist rather than risking a failed or reused URL.
8. LOCATION: The artist must be based in Australia and primarily match the provided genres.
9. SOURCE: Try and get from the discover page of their genre like https://bandcamp.com/discover/${genres?.[0].toLowerCase()}

Output:
Return ONLY a JSON object with:
- "url"
- "artistName"
- "confidenceScore"
- "matchReason"
`,
    },
  ];

  try {
    const aiRes = await googleGenClient<ArtistUrlResponse>(prompt, artistUrlResponseSchema);

    if (!aiRes || !aiRes.url || aiRes.confidenceScore < 0.7) {
      console.warn(`No url, URL: ${aiRes?.url} or low confidence score, score: ${aiRes?.confidenceScore}`);
    }

    return aiRes;
  } catch (err) {
    console.warn(`URL generation failed for ${artists[0]}`, err);
  }
};
