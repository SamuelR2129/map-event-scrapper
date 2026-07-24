import { firefox, Browser } from "playwright";

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await firefox.launch();
  }
  return browser;
}
