import { browser } from "@wdio/globals";
import { signInDevUser } from "./wdio-owner.js";

// Playwright's goto lets the page's own redirect take over the navigation; WebDriver BiDi reports it as an error.
export function followClientRedirects() {
  browser.overwriteCommand("url", async (url, path, options) => {
    try {
      return await url(path, options);
    } catch (error) {
      if (!/navigation canceled by concurrent navigation/.test(error.message)) throw error;
      await browser.waitUntil(() => browser.execute(() => document.readyState === "complete"));
    }
  });
}

// The shared specs run as the seeded dev user, as Playwright's shared project does.
export const mochaHooks = {
  async beforeEach() {
    if (process.env.E2E_PROJECT === "shared") await signInDevUser();
  },
};
