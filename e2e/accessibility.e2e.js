import { readdirSync } from "node:fs";
import { $, $$, browser, expect } from "@wdio/globals";
import { afterThisTest, clearCookies, settle } from "./wdio-browser.js";
import { axeViolations } from "./wdio-axe.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";
import { mockTurnstile } from "./wdio-turnstile.js";

const expectNoViolations = async () => expect(await axeViolations()).toEqual([]);

const OWNER_PAGES = [
  "/log",
  "/view",
  "/view/map",
  "/performance",
  "/performance/pyramid",
  "/performance/trends",
  "/performance/gap",
  "/performance/rpe",
  "/performance/strengths",
  "/performance/injury",
  "/account",
  "/account/authentication",
  "/account/import-export",
  "/account/beta",
  "/account/health",
  "/account/places",
];

const PUBLIC_PAGES = [
  "/help/",
  ...readdirSync("views/help", { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => `/help/${entry.name}/`),
  "/",
  "/login/",
  "/register/",
  "/reset-password/",
];

for (const colorScheme of ["light", "dark"]) {
  describe(`${colorScheme} theme`, () => {
    beforeEach(async () => {
      await browser.setViewport({ width: 375, height: 812 });
      afterThisTest(await browser.emulate("colorScheme", colorScheme));
    });

    for (const path of OWNER_PAGES) {
      it(`${path} has no WCAG 2.2 AA violations`, async () => {
        const owner = await claimOwner();
        await owner.settings({ athleteMode: true });
        await owner.seed({
          entries: [
            { name: "Alpha", notes: "A note", video: "https://www.youtube.com/watch?v=abc" },
            { status: "project" },
          ],
        });
        await gotoSyncedLog(owner);
        await browser.url(owner.url(path));
        await settle();
        if (path === "/log") await $$(".place-header")[0].click();
        await expectNoViolations();
      });
    }

    it("the entry form has no WCAG 2.2 AA violations", async () => {
      const owner = await claimOwner();
      await owner.settings({ athleteMode: true });
      await gotoSyncedLog(owner);
      await $("#add-btn").click();
      await expect($("#entry-overlay")).toBeDisplayed();
      await expectNoViolations();
    });

    it("the public profile has no WCAG 2.2 AA violations", async () => {
      const owner = await claimOwner();
      await owner.seed({ entries: [{ name: "Alpha" }] });
      await clearCookies();
      await browser.url(owner.url(""));
      await expect($$(".place-header")[0]).toBeDisplayed();
      await expectNoViolations();
    });

    for (const path of PUBLIC_PAGES) {
      it(`${path} has no WCAG 2.2 AA violations`, async () => {
        await clearCookies();
        await mockTurnstile();
        await browser.url(path);
        await expect($("main")).toBeDisplayed();
        await expectNoViolations();
      });
    }
  });
}
