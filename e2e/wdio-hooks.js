import { mkdirSync, writeFileSync } from "node:fs";
import { browser } from "@wdio/globals";
import { currentContext } from "./wdio-browser.js";
import { signInDevUser } from "./wdio-owner.js";

const PAGE_REPLACED =
  /navigation canceled by concurrent navigation|Cannot find context with specified id|does not belong to the document/;

// Playwright rides out the page's own redirects and reloads; WebDriver BiDi reports them as errors.
export function rideOutPageNavigations() {
  browser.overwriteCommand("url", async (url, path, options) => {
    try {
      return await url(path, options);
    } catch (error) {
      if (!PAGE_REPLACED.test(error.message)) throw error;
      await browser.waitUntil(() => browser.execute(() => document.readyState === "complete"));
    }
  });
  browser.overwriteCommand("browsingContextLocateNodes", async (locateNodes, params) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await locateNodes(params);
      } catch (error) {
        if (attempt === 10 || !PAGE_REPLACED.test(error.message)) throw error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  });
}

export async function screenshotFailure(test) {
  if (test?.state !== "failed") return;
  const name = `${test.parent?.title} ${test.title} ${browser.capabilities.browserName} ${Date.now()}`.replace(
    /[^a-z0-9]+/gi,
    "-",
  );
  try {
    const { data } = await browser.browsingContextCaptureScreenshot({ context: currentContext() });
    mkdirSync("test-results/wdio", { recursive: true });
    writeFileSync(`test-results/wdio/${name.slice(0, 150)}.png`, Buffer.from(data, "base64"));
  } catch (error) {
    console.warn(`No screenshot of the failure: ${error.message}`);
  }
}

// Playwright's Desktop Chrome viewport, and the shared specs run as the seeded dev user, as its shared project does.
export const mochaHooks = {
  async beforeEach() {
    await browser.setViewport({ width: 1280, height: 720 });
    if (process.env.E2E_PROJECT === "shared") await signInDevUser();
  },
  async afterEach() {
    await screenshotFailure(this.currentTest ?? this.test);
  },
};
