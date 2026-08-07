import { Page } from "playwright";
import { aiGenerateArtistBandCampUrl } from "./ai/aiGenerateArtistBandCampUrl";
import { isSafeExternalUrl } from "./ssrf";

type BandCampMedia = {
  artist: string;
  mediaId: string;
};

const getMediaIdFromSearchBar = async (page: Page, artistLabel: string): Promise<BandCampMedia | null> => {
  console.log("[search] attempting search for:", artistLabel);

  const searchBarNode = page.locator(".search-bar input");

  if (!(await searchBarNode.isVisible())) {
    console.warn("[search] search bar not visible");
    return null;
  }

  await searchBarNode.fill(artistLabel);
  await searchBarNode.press("Enter");
  console.log("[search] filled + submitted search");

  const mediaButton = page.getByLabel("display albums results");
  await mediaButton.waitFor({ state: "visible" });
  await mediaButton.click({ force: true });
  console.log("[search] clicked media filter");

  await page.waitForTimeout(1000);

  const results = page.locator("[data-item-id]");
  const count = await results.count();
  console.log(`[search] found ${count} results`);

  if (count === 0) {
    console.warn("[search] no results found after filtering");
    return null;
  }

  const mediaId = await results.first().getAttribute("data-item-id");

  if (!mediaId) {
    console.warn("[search] first result had no data-item-id");
    return null;
  }

  console.log("[search] ✅ found mediaId via search:", artistLabel, mediaId);
  return { artist: artistLabel, mediaId };
};

async function fetchMediaIdFromUrl(
  page: Page,
  url: string,
  artistLabel: string,
  genres: string[],
): Promise<BandCampMedia | null> {
  try {
    const urlCheck = await isSafeExternalUrl(url);
    if (!urlCheck.safe) {
      console.warn(`[fetch] ❌ blocked unsafe URL: ${url} (${urlCheck.reason})`);
      return null;
    }

    console.log("[fetch] navigating to:", url, genres);
    await page.goto(url, { waitUntil: "load" });
    const signUpHeading = page.getByRole("heading", {
      level: 1,
      name: "Sign Up for an Artist Account",
    });
    if (await signUpHeading.isVisible()) {
      console.warn("[fetch] ❌ landed on signup page:", url);
      return null;
    }

    // Attempt 1: direct DOM lookup
    const mediaLocator = page.locator("[data-item-id]").first();
    if (await mediaLocator.isVisible()) {
      const mediaId = await mediaLocator.getAttribute("data-item-id");
      if (mediaId) {
        console.log("[fetch] ✅ found mediaId from DOM:", mediaId, artistLabel);
        return { artist: artistLabel, mediaId };
      }
    }

    console.warn("[fetch] no visible [data-item-id] elements, trying og:video");

    // Attempt 2: og:video meta tag
    const videoUrlNode = page.locator('meta[property="og:video"]');
    if ((await videoUrlNode.count()) > 0) {
      const videoUrl = await videoUrlNode.getAttribute("content");
      console.log("[fetch] og:video content:", videoUrl);
      const match = videoUrl?.match(/(album|track)=(\d+)/);
      const mediaId = match ? `${match[1]}=${match[2]}` : null;
      if (mediaId) {
        console.log("[fetch] ✅ found mediaId from og:video:", mediaId, artistLabel);
        return { artist: artistLabel, mediaId };
      }
      console.warn("[fetch] ❌ couldn't extract mediaId from og:video:", videoUrl);
    } else {
      console.warn("[fetch] ❌ og:video meta tag not found");
    }

    // Attempt 3: discover page fallback
    if (genres.length > 0) {
      const discoverUrl = `https://bandcamp.com/discover/${genres[0]}`;
      console.warn("[fetch] trying discover fallback:", discoverUrl);

      const discoverCheck = await isSafeExternalUrl(discoverUrl);
      if (!discoverCheck.safe) {
        console.warn(`[fetch] ❌ blocked unsafe discover URL: ${discoverUrl} (${discoverCheck.reason})`);
        return null;
      }

      await page.goto(discoverUrl, { waitUntil: "load" });

      const gridItem = page.locator('[data-test^="results-grid-item-"]').first();
      if (await gridItem.isVisible()) {
        await gridItem.click();
        await page.waitForLoadState("load");

        const discoverVideoUrlNode = page.locator('meta[property="og:video"]');
        if ((await discoverVideoUrlNode.count()) > 0) {
          const videoUrl = await discoverVideoUrlNode.getAttribute("content");
          console.log("[fetch] og:video content (discover fallback):", videoUrl);
          const match = videoUrl?.match(/(album|track)=(\d+)/);
          const mediaId = match ? `${match[1]}=${match[2]}` : null;
          if (mediaId) {
            console.log("[fetch] ✅ found mediaId from discover fallback:", mediaId, artistLabel);
            return { artist: artistLabel, mediaId };
          }
          console.warn("[fetch] ❌ couldn't extract mediaId from discover og:video:", videoUrl);
        } else {
          console.warn("[fetch] ❌ og:video not found on discover item page");
        }
      } else {
        console.warn("[fetch] ❌ no results-grid-item found on discover page:", discoverUrl);
      }
    }
  } catch (err) {
    console.warn(`[fetch] ❌ failed to fetch Bandcamp page at URL: ${url}`, err);
    if (typeof err === "string" && err.includes("ERR_NAME_NOT_RESOLVED")) {
      console.log("Closing page");
      await page.close();
    }
  }

  return null;
}

export async function getBandCampMediaIds(
  page: Page,
  source: string,
  eventName: string,
  genres?: string,
): Promise<BandCampMedia[]> {
  console.log("[main] starting media fetch for event:", eventName);

  await page.route("**/*", (route) => {
    const blockedTypes = ["image", "font", "media", "png", "jpeg", "gif"];
    if (blockedTypes.includes(route.request().resourceType())) {
      route.abort();
    } else {
      route.continue();
    }
  });

  const artistNames = source === "whList" ? eventName.split(",").map((a) => a.trim()) : [];

  console.log("[main] parsed artist names:", artistNames);

  const results: BandCampMedia[] = [];

  // --- Direct URL attempt ---
  for (const artistLabel of artistNames) {
    const slug = artistLabel.replace(" ", "").toLowerCase();
    const websiteUrl = `https://${slug}.bandcamp.com/`;

    console.log("[main] trying direct URL:", websiteUrl);

    const media = await fetchMediaIdFromUrl(
      page,
      websiteUrl,
      artistLabel,
      genres?.split(",").filter((x) => x.trim() !== "FREE") || [],
    );

    if (media) {
      results.push(media);
      console.log("[main] ✅ success via direct URL:", media);
      break;
    } else {
      console.log("[main] ❌ no result via direct URL:", websiteUrl);
    }
  }

  // --- AI fallback ---
  if (!results.length) {
    console.log("[main] ⚠️ no results via direct URLs, falling back to AI");

    const MAX_RETRIES = 3;
    const failedUrls: string[] = [];

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`[ai] attempt ${attempt}/${MAX_RETRIES}`);

      const aiResult = await aiGenerateArtistBandCampUrl(artistNames, failedUrls, genres);

      if (!aiResult?.url) {
        console.warn("[ai] no URL returned from AI");
        continue;
      }

      console.log(`[ai] trying ${aiResult.artistName}: ${aiResult.url} (confidence: ${aiResult.confidenceScore})`);

      const media = await fetchMediaIdFromUrl(
        page,
        aiResult.url,
        aiResult.artistName,
        genres?.split(",").filter((x) => x.trim() !== "FREE") || [],
      );

      if (media) {
        results.push(media);
        console.log("[ai] ✅ success via AI URL:", media);
        break;
      }

      // fetchMediaIdFromUrl returned null — either signup page or no media found.
      // Fall back to search bar.
      console.log("[ai] falling back to search bar for:", aiResult.artistName);
      const mediaFromSearch = await getMediaIdFromSearchBar(page, aiResult.artistName);

      if (mediaFromSearch) {
        results.push(mediaFromSearch);
        console.log("[ai] ✅ success via search fallback:", mediaFromSearch);
        break;
      }

      failedUrls.push(aiResult.url);
      console.log(`[ai] ❌ failed attempt ${attempt}:`, aiResult.url);
    }
  }

  console.log("[main] finished. total results:", results.length);
  return results.map((x) => {
    return { ...x, ...{ mediaId: x.mediaId.replace("-", "=") } };
  });
}
