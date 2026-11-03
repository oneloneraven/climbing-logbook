import { $, $$, browser, expect } from "@wdio/globals";
import { entriesDatabase, readCachedEntries } from "./entries-cache.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

const SEED = {
  entries: [
    { type: "boulder", name: "Boulder Seed" },
    { type: "boulder", grade: "7A", name: "Second Seed" },
  ],
};
const cachedEntries = owner => browser.execute(readCachedEntries, entriesDatabase(owner.username));

describe("entries cache", () => {
  it("a new entry is cached in IndexedDB and still there after a reload", async () => {
    const owner = await claimOwner();
    await owner.seed(SEED);
    await gotoSyncedLog(owner);

    const entryName = `E2E cached ${Date.now()}`;
    await $("#add-btn").click();
    await $("#entry-name").setValue(entryName);
    await $("#place-btn").click();
    await $$("#place-listbox li")[0].click();
    const saved = await browser.mock("**/-/api/entries", { method: "POST" });
    await $("#entry-submit-btn").click();
    await saved.waitForResponse();
    await expect($("#entry-overlay")).not.toBeDisplayed();
    await browser.waitUntil(async () => (await cachedEntries(owner)).some(e => e.name === entryName));

    const entries = await browser.mock("**/-/api/entries**");
    entries.abort();
    await browser.refresh();
    await expect($("#sections")).toHaveTextContent(expect.stringContaining(entryName));
  });
});
