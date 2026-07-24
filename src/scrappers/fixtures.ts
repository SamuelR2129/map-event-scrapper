import { test as base } from "@playwright/test";
import { cityConfig, CityConfig } from "../cityConfig";

export type Fixtures = {
  config: CityConfig;
};

export const test = base.extend<Fixtures>({
  config: async ({}, use, testInfo) => {
    const data = await cityConfig(testInfo.project.name);
    await use(data);
  },
});

export { expect } from "@playwright/test";
