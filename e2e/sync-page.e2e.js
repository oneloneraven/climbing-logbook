import { $, browser, expect } from "@wdio/globals";
import { entriesDatabase, readCachedEntries } from "./entries-cache.js";
import { recordNavigations, settle, waitForPath } from "./wdio-browser.js";
import { holdRequests } from "./wdio-hold.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

const SEED = {
  entries: [
    { type: "boulder", name: "Boulder Seed" },
    { type: "sport", grade: "6a", name: "Sport Seed" },
  ],
};

const storedJson = (key, username) => browser.execute(k => JSON.parse(localStorage.getItem(k)), `${key}:${username}`);
const cachedEntries = owner => browser.execute(readCachedEntries, entriesDatabase(owner.username));
const syncUrl = owner => owner.url(`/sync?returnTo=${encodeURIComponent(`/${owner.username}/log`)}`);

async function seededOwner() {
  const owner = await claimOwner();
  await owner.seed(SEED);
  return owner;
}

describe("sync page", () => {
  it("cold start: fetches everything in chunks and redirects to returnTo once synced", async () => {
    const owner = await seededOwner();

    await browser.url(syncUrl(owner));
    await waitForPath(`/${owner.username}/log`);

    const cached = await cachedEntries(owner);
    expect(cached.map(e => e.name).toSorted()).toEqual(["Boulder Seed", "Sport Seed"]);
  });

  it("an unsafe returnTo falls back to /:username/log", async () => {
    const owner = await claimOwner();
    await browser.url(owner.url(`/sync?returnTo=${encodeURIComponent("https://evil.example/pwned")}`));
    await waitForPath(`/${owner.username}/log`);
  });

  it("a failed fetch shows the error state with a retry button, not a silent hang", async () => {
    const owner = await claimOwner();
    (await browser.mock("**/-/api/places*")).abort();

    await browser.url(syncUrl(owner));
    await expect($("#sync-error")).toBeDisplayed();
    await expect($("#sync-card")).not.toBeDisplayed();
    await expect($("#sync-retry-btn")).toBeDisplayed();
  });

  it("/log redirects to /:username/sync when not yet synced, preserving returnTo", async () => {
    const owner = await claimOwner();
    const navigations = await recordNavigations();
    await browser.url(owner.url("/log"));
    const toSync = () => navigations.find(url => url.pathname === `/${owner.username}/sync`);
    await browser.waitUntil(toSync, { timeoutMsg: "never went to /sync" });

    expect(toSync().searchParams.get("returnTo")).toBe(`/${owner.username}/log`);
  });

  it("warm with drift: /sync takes the delta path and catches up on a change from another session", async () => {
    const owner = await seededOwner();
    await gotoSyncedLog(owner);
    const seededCursor = (await storedJson("logbook_sync_cursors", owner.username)).entries;

    await owner.seed({ locations: [], places: [], entries: [{ id: "drift-1", grade: "7A", name: "Drifted In" }] });

    const entriesRequests = await browser.mock("**/-/api/entries**", {
      method: "GET",
      requestHeaders: headers => (headers.referer ?? headers.Referer ?? "").includes(`/${owner.username}/sync`),
    });
    await browser.url(syncUrl(owner));
    await waitForPath(`/${owner.username}/log`);

    const urls = entriesRequests.calls.map(call => call.request.url);
    expect(urls.some(url => url.includes(`?since=${seededCursor}`))).toBe(true);
    expect(urls.some(url => url.includes("?limit="))).toBe(false);
    const cached = await cachedEntries(owner);
    expect(cached.map(e => e.name)).toContain("Drifted In");
  });

  it("a device offline past the tombstone purge gets a 410 and syncs again in full (#1051)", async () => {
    const owner = await seededOwner();
    await gotoSyncedLog(owner);
    await owner.seed({ locations: [], places: [], entries: [{ id: "after-purge", grade: "7A", name: "After Purge" }] });

    const delta = await browser.mock("http://my.localhost:8787/-/api/entries?since=*");
    delta.respondOnce({}, { statusCode: 410, fetchResponse: false });
    const navigations = await recordNavigations();

    await browser.url(owner.url("/log"));
    const backFromSync = () => {
      const paths = navigations.map(url => url.pathname);
      const sync = paths.indexOf(`/${owner.username}/sync`);
      return sync >= 0 && paths.slice(sync + 1).includes(`/${owner.username}/log`);
    };
    await browser.waitUntil(backFromSync, { timeoutMsg: "never went through /sync and back to /log" });
    await waitForPath(`/${owner.username}/log`);
    const cached = await cachedEntries(owner);
    expect(cached.map(e => e.name)).toContain("After Purge");
  });

  it("a freshly synced device already has its settings when /log renders, so the form shows Performance (#1177)", async () => {
    const owner = await seededOwner();
    await owner.settings({ athleteMode: true });
    const settings = await browser.mock("**/-/api/settings", {
      requestHeaders: headers => !(headers.referer ?? headers.Referer ?? "").includes(`/${owner.username}/sync`),
    });
    settings.abort();

    await browser.url(syncUrl(owner));
    await waitForPath(`/${owner.username}/log`);
    await $("#add-btn").click();

    await expect($("#entry-nav-forward")).toBeDisplayed();
    const cached = await storedJson("logbook_settings_cache", owner.username);
    expect(cached).toMatchObject({ athleteMode: true, logbookPublic: true, betaOptIn: false });
  });

  it("a settings request that never answers delays leaving /sync by seconds, not minutes", async () => {
    const owner = await seededOwner();
    await holdRequests("/-/api/settings");

    await browser.url(syncUrl(owner));
    await browser.waitUntil(async () => new URL(await browser.getUrl()).pathname === `/${owner.username}/log`, {
      timeout: 20000,
      timeoutMsg: "still on /sync after 20s",
    });
    await expect($("climbing-entries-table")).toHaveTextContent(expect.stringContaining("Test Crag"));
  });

  it("a settings request that fails doesn't stop the sync", async () => {
    const owner = await seededOwner();
    (await browser.mock("**/-/api/settings")).abort();

    await browser.url(syncUrl(owner));
    await waitForPath(`/${owner.username}/log`);

    expect(await cachedEntries(owner)).toHaveLength(2);
    await expect($("climbing-entries-table")).toHaveTextContent(expect.stringContaining("Test Crag"));
  });

  it("/log does NOT redirect to /sync once already synced", async () => {
    const owner = await seededOwner();
    await gotoSyncedLog(owner);

    const navigations = await recordNavigations();
    await browser.refresh();
    await expect($("climbing-entries-table")).toHaveTextContent(expect.stringContaining("Test Crag"));
    await settle();

    expect(navigations.map(url => url.pathname)).toEqual([`/${owner.username}/log`]);
  });
});
