import { test } from "@playwright/test";
import { DateTime } from "luxon";
import * as fs from "fs";
import path from "path";

const WEEKLY_PHOTOS_DIR = path.join(__dirname, "../eventFiles/weeklyPhotos");
const DAYS = ["wednesday", "thursday", "friday", "saturday", "sunday"];

test("Download weekly photos from witchhouse_newcastle Instagram", async ({
  page,
}) => {
  fs.rmSync(WEEKLY_PHOTOS_DIR, { recursive: true, force: true });
  fs.mkdirSync(WEEKLY_PHOTOS_DIR, { recursive: true });
  await page.goto("https://www.instagram.com/witchhouse_newcastle/");
  await page.waitForLoadState("networkidle");

  const postLinks = page.locator('a[href*="/witchhouse_newcastle/p/"]');
  const fifthHref = await postLinks.nth(3).getAttribute("href");
  const baseUrl = `https://www.instagram.com${fifthHref}`;

  const expectedAlt = `Photo by witchhouse on ${DateTime.now().setZone("Australia/Sydney").toFormat("MMMM dd, yyyy")}`;
  await page.goto(baseUrl);
  await page.waitForLoadState("networkidle");
  const imageCount = await page.locator(`img[alt^="${expectedAlt}"]`).count();

  if (imageCount === 0) {
    console.log(
      `No images found with alt "${expectedAlt}" — images probably not uploaded yet. Skipping.`,
    );
    return;
  }

  for (let i = 1; i <= 5; i++) {
    await page.goto(`${baseUrl}?img_index=${i}`);
    await page.waitForLoadState("networkidle");

    const nthImage = i === 1 ? 0 : 1;
    const img = page.locator('img[alt*="Photo by witchhouse"]').nth(nthImage);
    const imgUrl = await img.getAttribute("src");

    if (imgUrl) {
      const response = await page.request.get(imgUrl);
      const buffer = await response.body();
      fs.writeFileSync(
        path.join(WEEKLY_PHOTOS_DIR, `${DAYS[i - 1]}.png`),
        buffer,
      );
      console.log(`Downloaded ${DAYS[i - 1]} from ${imgUrl}`);
    }
  }
});
