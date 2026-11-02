import { readdirSync } from "node:fs";
import { $, $$, browser, expect } from "@wdio/globals";
import { boundingBox, clearCookies, expectEventually, textContents } from "./wdio-browser.js";
import { holdRequests } from "./wdio-hold.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

async function expectLandmarksAndSkipLink() {
  await expect($$("main")).toBeElementsArrayOfSize(1);
  await expectEventually(async () => (await textContents("h1", { visibleOnly: true })).length, 1);

  await browser.keys("Tab");
  const skip = $('role/link[name="Skip to content"]');
  await expect(skip).toBeFocused();
  expect((await boundingBox(skip)).width).toBeGreaterThan(1);

  await browser.keys("Enter");
  await expect($("main")).toBeFocused();
}

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

const HELP_PAGES = [
  "/help/",
  ...readdirSync("views/help", { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => `/help/${entry.name}/`),
];

describe("landmarks", () => {
  for (const path of OWNER_PAGES) {
    it(`${path} has one main, one h1 and a working skip link`, async () => {
      const owner = await claimOwner();
      await owner.settings({ athleteMode: true });
      await gotoSyncedLog(owner);
      await browser.url(owner.url(path));
      await expectLandmarksAndSkipLink();
    });
  }

  it("/sync has one main, one h1 and a working skip link", async () => {
    const owner = await claimOwner();
    await holdRequests("/-/api/places");
    await browser.url(owner.url("/sync"));
    await expectLandmarksAndSkipLink();
  });

  it("the public profile has one main, one h1 naming its owner, and a working skip link", async () => {
    const owner = await claimOwner();
    await clearCookies();
    await browser.url(owner.url(""));
    await expect($("h1")).toHaveTextContent(`${owner.username}'s logbook`);
    await expectLandmarksAndSkipLink();
  });

  for (const path of [...HELP_PAGES, "/", "/login/", "/register/", "/reset-password/"]) {
    it(`${path} has one main, one h1 and a working skip link`, async () => {
      await browser.url(path);
      await expectLandmarksAndSkipLink();
    });
  }
});
