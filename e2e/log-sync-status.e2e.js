import { $, browser, expect } from "@wdio/globals";
import { goOffline, recordFetches, settle } from "./wdio-browser.js";
import { holdRequests } from "./wdio-hold.js";
import { gotoLog } from "./wdio-log.js";

const contains = text => expect.stringContaining(text);
const goOnline = () => browser.execute(() => window.dispatchEvent(new Event("online")));
const ringOpacity = () =>
  browser.execute(() => getComputedStyle(document.querySelector("#header-menu-btn .menu-sync-ring")).opacity);

async function addEntry(owner, entryName) {
  await $("#add-btn").click();
  await $("#entry-name").setValue(entryName);
  await $("#place-btn").click();
  await $(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
  await $("#entry-submit-btn").click();
}

async function failEntryWrites() {
  const writes = await browser.mock("**/-/api/entries**", { method: method => method !== "GET" });
  writes.abort();
}

describe("log sync status", () => {
  it("#847 -- the sync status ring actually disappears (not just the data attribute) once background reconcile settles", async () => {
    await gotoLog();
    const releaseSession = await holdRequests("/-/api/auth/get-session");
    await browser.refresh();

    await browser.waitUntil(async () => (await ringOpacity()) !== "0", { timeoutMsg: "the ring never showed" });
    await releaseSession();
    await browser.waitUntil(async () => (await ringOpacity()) === "0", { timeoutMsg: "the ring never went" });
  });

  it("#847 -- the burger menu shows a status row while syncing; #878 -- Help is always present regardless; #893 -- the sync live region announces start and completion", async () => {
    await gotoLog();
    const releaseSession = await holdRequests("/-/api/auth/get-session");
    await browser.refresh();

    await expect($("#menu-sync-announce")).toHaveTextContent("Syncing…");

    await $("#header-menu-btn").click();
    await expect($("#menu-status-row")).toBeDisplayed();
    await expect($("#menu-status-text")).toHaveTextContent("Status: Syncing…");
    await expect($("#menu-help-link")).toHaveAttribute("href", "/help/");

    await releaseSession();
    await expect($("#menu-status-row")).not.toBeDisplayed();
    await expect($("#menu-sync-announce")).toHaveTextContent("Synced.");
    await expect($("#menu-help-link")).toBeDisplayed();
  });

  it("#847 -- going offline turns the burger menu ring solid red and updates the status row; #893 -- and announces it", async () => {
    await gotoLog();

    await goOffline();
    await expect($("#header-menu-btn")).toHaveAttribute("data-sync-state", "offline");
    await expect($("#menu-sync-announce")).toHaveTextContent(
      "You're offline. Changes will sync when you're back online.",
    );
    await $("#header-menu-btn").click();
    await expect($("#menu-status-text")).toHaveTextContent("Status: Offline");
  });

  it("a dead link that reads as online shows Offline, keeps it through the next failed sync, and clears once the server answers (#1486)", async () => {
    await gotoLog();
    const menuButton = () => $("#header-menu-btn");
    const api = await browser.mock("**/-/api/**");
    api.abort();

    await browser.refresh();
    expect(await browser.execute(() => navigator.onLine)).toBe(true);
    await expect(menuButton()).toHaveAttribute("data-sync-state", "offline");

    await goOnline();
    await settle();
    await expect(menuButton()).toHaveAttribute("data-sync-state", "offline");

    await api.restore();
    await goOnline();
    await expect(menuButton()).not.toHaveAttribute("data-sync-state");
  });

  it("#893 -- the live region doesn't re-announce while already syncing", async () => {
    await gotoLog();
    const fetches = await recordFetches();
    const releaseSession = await holdRequests("/-/api/auth/get-session");
    const releaseSettings = await holdRequests("/-/api/settings");
    await browser.refresh();

    await expect($("#menu-sync-announce")).toHaveTextContent("Syncing…");
    await browser.execute(() => {
      document.getElementById("menu-sync-announce").textContent = "";
    });

    const sessionSettled = fetches.next("/-/api/auth/get-session", "GET");
    await releaseSession();
    await sessionSettled;
    await expect($("#menu-sync-announce")).toHaveTextContent("");

    const settingsSettled = fetches.next("/-/api/settings", "GET");
    await releaseSettings();
    await settingsSettled;
    await expect($("#menu-sync-announce")).toHaveTextContent("Synced.");
  });

  describe("A full device (#1083)", () => {
    it("keeps the form open with a clear message when even that isn't enough", async () => {
      await browser.addInitScript(() => {
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key.startsWith("logbook_pending_queue")) {
            throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
          }
          return setItem.call(this, key, value);
        };
      });
      const owner = await gotoLog();

      const entryName = `E2E no room ${Date.now()}`;
      await failEntryWrites();
      await addEntry(owner, entryName);

      await expect($("#entry-msg")).toHaveTextContent(contains("Your device's storage is full"));
      await expect($("#entry-overlay")).toBeDisplayed();
      await expect($("#entry-name")).toHaveValue(entryName);
      await expect($("#sync-line")).not.toBeDisplayed();
    });
  });

  describe("Safari in a tab (#1083)", () => {
    it("suggests installing the app while there are unsynced climbs", async () => {
      await browser.emulate(
        "userAgent",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      );
      const owner = await gotoLog();
      const nudge = $("#install-nudge");
      await expect(nudge).not.toBeDisplayed();

      await failEntryWrites();
      await addEntry(owner, `E2E Safari ${Date.now()}`);

      await expect(nudge).toBeDisplayed();
      await expect(nudge.$("a*=Install the app")).toHaveAttribute("href", expect.stringMatching(/\/help\/install\/$/));
    });
  });
});
