import { $, browser, expect } from "@wdio/globals";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { entriesDatabase, readCachedEntries } from "./entries-cache.js";
import { ownedRouteUrl } from "./owned-route-url.js";
import { settle, waitForPath } from "./wdio-browser.js";
import { signInDevUser } from "./wdio-owner.js";

const OWNER = DEV_USER.username.toLowerCase();

const storageSnapshot = () =>
  browser.execute(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
const cachedEntries = () => browser.execute(readCachedEntries, entriesDatabase(OWNER));

describe("per-user data", () => {
  beforeEach(() => signInDevUser("my.localhost"));

  it("an owner page records the signed-in user and keeps its data under that user's namespace", async () => {
    await browser.url(ownedRouteUrl(DEV_USER.username, "/log"));
    await expect($("climbing-entries-table")).toBeDisplayed();
    await browser.waitUntil(async () => (await cachedEntries().catch(() => null))?.length > 0);
    await waitForPath(`/${DEV_USER.username}/log`);
    await settle();

    const keys = await storageSnapshot();
    expect(keys.logbook_signed_in_user).toBe(OWNER);
    expect(keys.logbook_sync_status).toBeUndefined();
    expect(keys[`logbook_sync_status:${OWNER}`]).toBeTruthy();
    const databases = (await browser.execute(() => indexedDB.databases())).map(db => db.name);
    expect(databases).not.toContain("logbook_entries");
  });

  it("another user's cached data on the same device never shows on this user's pages", async () => {
    await browser.url(ownedRouteUrl(DEV_USER.username, "/log"));
    await expect($("climbing-entries-table")).toBeDisplayed();
    const alienEntry = {
      id: "alien-entry-1",
      date: "2026-01-01",
      name: "Someone else's secret climb",
      type: "boulder",
      grade: "7A",
      status: "flash",
      locationId: "x",
      placeId: "y",
    };
    await browser.execute(entry => {
      localStorage.setItem("logbook_signed_in_user", "someoneelse");
      localStorage.setItem("logbook_entries_cache", JSON.stringify([entry]));
      localStorage.setItem("logbook_pending_queue", JSON.stringify([{ kind: "entry", op: "add", record: entry }]));
    }, alienEntry);

    await browser.refresh();
    await expect($("climbing-entries-table")).toBeDisplayed();
    expect(await browser.execute(() => document.body.textContent)).not.toContain("Someone else's secret climb");
    const keys = await storageSnapshot();
    expect((await cachedEntries()) ?? []).not.toContainEqual(expect.objectContaining({ id: "alien-entry-1" }));
    expect(keys[`logbook_pending_queue:${OWNER}`] ?? "").not.toContain("alien-entry-1");
    expect(keys.logbook_signed_in_user).toBe(OWNER);
  });
});
