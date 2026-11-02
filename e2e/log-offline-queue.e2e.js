import { $, $$, browser, expect } from "@wdio/globals";
import { entriesDatabase, readCachedEntries } from "./entries-cache.js";
import { clearCookies, expectEventually, recordFetches } from "./wdio-browser.js";
import { holdRequests } from "./wdio-hold.js";
import { gotoLog } from "./wdio-log.js";

const contains = text => expect.stringContaining(text);
const sections = () => $("#sections");
const rowWith = name => $(`//tr[.//*[normalize-space(text())=${JSON.stringify(name)}]]`);
const goOnline = () => browser.execute(() => window.dispatchEvent(new Event("online")));

// Writes fail as if the connection dropped; reads still work. Returns a function that brings writes back.
async function failWrites(...patterns) {
  const mocks = [];
  for (const pattern of patterns) {
    const writes = await browser.mock(pattern, { method: method => method !== "GET" });
    writes.abort();
    mocks.push(writes);
  }
  return () => Promise.all(mocks.map(mock => mock.restore()));
}

async function addEntry(owner, entryName) {
  await $("#add-btn").click();
  await $("#entry-name").setValue(entryName);
  await $("#place-btn").click();
  await $(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
  await $("#entry-submit-btn").click();
}

async function queueEntryOffline(owner, entryName) {
  await addEntry(owner, entryName);
  await expect($("#entry-overlay")).not.toBeDisplayed();
  await expect($("#sync-line-text")).toHaveTextContent("1 change waiting to sync");
}

async function invalidateQueuedWrite(owner) {
  await browser.execute(key => {
    const queue = JSON.parse(localStorage.getItem(key));
    queue[0].record.grade = "not-a-grade";
    localStorage.setItem(key, JSON.stringify(queue));
  }, `logbook_pending_queue:${owner.username}`);
}

async function deleteRow(name) {
  await rowWith(name).$(".edit-btn").click();
  browser.once("dialog", dialog => dialog.accept());
  await $("#entry-delete-btn").click();
  await expect($("#entry-overlay")).not.toBeDisplayed();
}

// Responses, not requests: an aborted write has none.
const savedEntryWrites = fetches =>
  fetches
    .all()
    .filter(f => f.url.includes("/-/api/entries") && f.method !== "GET")
    .map(f => f.method);

async function addPlaceToExistingCrag() {
  await $("#place-btn").click();
  await $("#place-add-new-btn").click();
  await expect($("#add-place-overlay")).toBeDisplayed();
  await $("#add-place-location").setValue("existing crag");
  await $("#add-place-area").setValue("Sector 1");
  await $("#add-place-country-btn").click();
  await $("#add-place-country-search").setValue("France");
  await $('#add-place-country-listbox li[data-key="France"]').click();
  await $("#add-place-submit-btn").click();
  await expect($("#add-place-overlay")).not.toBeDisplayed();
}

describe("Offline queue (client/offline-sync.js)", () => {
  it("queues an entry while offline, then syncs it once back online", async () => {
    const fetches = await recordFetches();
    const owner = await gotoLog();
    const entryName = `E2E offline climb ${Date.now()}`;
    const writesBack = await failWrites("**/-/api/entries**");

    await addEntry(owner, entryName);
    await expect($("#entry-overlay")).not.toBeDisplayed();
    await expect(sections()).toHaveTextContent(contains(entryName));
    await expect($("#sync-line")).toBeDisplayed();

    const posted = fetches.next("/-/api/entries", "POST");
    await writesBack();
    await goOnline();
    await posted;

    await expect($("#sync-line")).not.toBeDisplayed();
  });

  it("a queued add the server rejects moves to the banner, and Discard clears it", async () => {
    const owner = await gotoLog();
    const writesBack = await failWrites("**/-/api/entries**");

    const entryName = `E2E rejected ${Date.now()}`;
    await queueEntryOffline(owner, entryName);
    await invalidateQueuedWrite(owner);

    await writesBack();
    await goOnline();

    const banner = $("#failed-writes");
    await expect(banner).toBeDisplayed();
    await expect(banner).toHaveTextContent(contains(`Couldn't save “${entryName}”: grade`));
    await expect($("#sync-line")).not.toBeDisplayed();
    await expect(sections()).not.toHaveTextContent(contains(entryName));

    await banner.$('role/button[name="Discard"]').click();
    await expect(banner).not.toBeDisplayed();
    await browser.refresh();
    await expect($("#failed-writes")).not.toBeDisplayed();
  });

  it("Edit on a rejected add reopens it in the form, and saving it clears the banner", async () => {
    const owner = await gotoLog();
    const writesBack = await failWrites("**/-/api/entries**");

    const entryName = `E2E fix me ${Date.now()}`;
    await queueEntryOffline(owner, entryName);
    await invalidateQueuedWrite(owner);
    await writesBack();
    await goOnline();
    await expect($("#failed-writes")).toBeDisplayed();

    await $("#failed-writes").$('role/button[name="Edit"]').click();
    await expect($("#entry-overlay")).toBeDisplayed();
    await expect($("#entry-modal-title")).toHaveTextContent("Add entry");
    await expect($("#entry-name")).toHaveValue(entryName);
    await $("#entry-submit-btn").click();

    await expect($("#entry-overlay")).not.toBeDisplayed();
    await expect($("#failed-writes")).not.toBeDisplayed();
    await expect(sections()).toHaveTextContent(contains(entryName));
  });

  it("a 503 stops the replay at the failing item, keeping everything queued in order", async () => {
    const fetches = await recordFetches();
    const owner = await gotoLog();
    const writesBack = await failWrites("**/-/api/entries**");

    const first = `E2E first ${Date.now()}`;
    await queueEntryOffline(owner, first);
    await addEntry(owner, `E2E second ${Date.now()}`);
    await expect($("#sync-line-text")).toHaveTextContent("2 changes waiting to sync");

    await writesBack();
    const down = await browser.mock("**/-/api/entries**", { method: method => method !== "GET" });
    down.respond("<h1>Service unavailable</h1>", {
      statusCode: 503,
      headers: { "content-type": "text/html" },
      fetchResponse: false,
    });
    const replayed = fetches.next("/-/api/entries", "POST");
    await goOnline();
    expect((await replayed).status).toBe(503);

    await expect($("#sync-line-text")).toHaveTextContent("2 changes waiting to sync");
    await expect($("#failed-writes")).not.toBeDisplayed();
    // Another trigger may retry the head of the queue, but nothing behind a failing item is ever sent.
    const sentWhileDown = fetches
      .all()
      .filter(f => f.status === 503)
      .map(f => JSON.parse(f.body).name);
    expect(sentWhileDown.length).toBeGreaterThan(0);
    expect(new Set(sentWhileDown)).toEqual(new Set([first]));
  });

  it("a direct save answered with a non-JSON 500 shows an error instead of queueing", async () => {
    const owner = await gotoLog();
    const posts = await browser.mock("**/-/api/entries**", { method: "POST" });
    posts.respond("<h1>Error 1101</h1>", {
      statusCode: 500,
      headers: { "content-type": "text/html" },
      fetchResponse: false,
    });

    await addEntry(owner, `E2E server error ${Date.now()}`);

    await expect($("#entry-msg")).toHaveTextContent(contains("Error 500"));
    await expect($("#entry-overlay")).toBeDisplayed();
    await expect($("#sync-line")).not.toBeDisplayed();
  });

  it("queues a save the server answers with a 401, and shows the page as signed out", async () => {
    const owner = await gotoLog();
    await clearCookies();

    const entryName = `E2E 401 save ${Date.now()}`;
    await addEntry(owner, entryName);

    await expect($("#entry-overlay")).not.toBeDisplayed();
    await expect(sections()).toHaveTextContent(contains(entryName));
    const queue = await browser.execute(
      () => Object.entries(localStorage).find(([key]) => key.startsWith("logbook_pending_queue"))?.[1],
    );
    expect(JSON.parse(queue ?? "[]")).toHaveLength(1);
    await $("#header-menu-btn").click();
    await expect($("#login-toggle-btn")).toHaveTextContent("Log in");
  });

  it("queues a save whose request hangs, once the write timeout passes", async () => {
    const owner = await gotoLog();
    await holdRequests("/-/api/entries", { method: "POST" });

    const entryName = `E2E hung save ${Date.now()}`;
    await addEntry(owner, entryName);

    await expect($("#entry-overlay")).not.toBeDisplayed({ wait: 15_000 });
    await expect(sections()).toHaveTextContent(contains(entryName));
    await expect($("#sync-line-text")).toHaveTextContent("1 change waiting to sync");
  });

  it("queues an add then a delete for the same never-synced entry, replays both in order on sync (#268)", async () => {
    const fetches = await recordFetches();
    const owner = await gotoLog();
    const entryName = `E2E add-then-delete ${Date.now()}`;
    const writesBack = await failWrites("**/-/api/entries**");

    await addEntry(owner, entryName);
    await expect($("#entry-overlay")).not.toBeDisplayed();
    await expect(sections()).toHaveTextContent(contains(entryName));

    await $("#collapse-all-btn").click();
    await deleteRow(entryName);

    await expect(sections()).toHaveTextContent(contains(entryName));

    await writesBack();
    await goOnline();

    await expect(sections()).not.toHaveTextContent(contains(entryName));
    await expect($("#sync-line")).not.toBeDisplayed();

    await expectEventually(() => savedEntryWrites(fetches), ["POST", "DELETE"]);
  });

  it("reconnect drift: a queued pending delete still executes when the same entry was edited on another device first", async () => {
    const fetches = await recordFetches();
    const owner = await gotoLog();
    const writesBack = await failWrites("**/-/api/entries**");

    await $("#collapse-all-btn").click();
    await deleteRow("Boulder Seed");
    await expect(sections()).toHaveTextContent(contains("Boulder Seed"));

    await owner.api("PUT", "entries", {
      id: owner.ownId("e1"),
      placeId: owner.ownId("p1"),
      type: "boulder",
      status: "send",
      grade: "6A",
      name: "Edited By Other Device",
    });

    const deleted = fetches.next("/-/api/entries", "DELETE");
    await writesBack();
    await goOnline();
    await deleted;

    await expect(sections()).not.toHaveTextContent(contains("Boulder Seed"));
    await expect(sections()).not.toHaveTextContent(contains("Edited By Other Device"));
    await expect($("#sync-line")).not.toBeDisplayed();

    const cached = await browser.execute(readCachedEntries, entriesDatabase(owner.username));
    expect(cached.some(e => e._pending || e._pendingDelete)).toBe(false);
  });

  it("reconnect re-entrancy: two online events in quick succession don't double-POST a queued item", async () => {
    const fetches = await recordFetches();
    const owner = await gotoLog();
    const entryName = `E2E reentrancy ${Date.now()}`;
    const writesBack = await failWrites("**/-/api/entries**");

    await addEntry(owner, entryName);
    await expect($("#entry-overlay")).not.toBeDisplayed();
    await expect(sections()).toHaveTextContent(contains(entryName));

    await writesBack();
    await browser.execute(() => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
    });

    await expect($("#sync-line")).not.toBeDisplayed();
    await expectEventually(() => savedEntryWrites(fetches), ["POST"]);
  });

  it("#490 -- an offline-created place/location dedups against a same-named row from another device, with the queued entry correctly remapped to it", async () => {
    const owner = await gotoLog({});
    await owner.seed({ locations: [{ id: "existing", name: "Existing Crag", country: "France" }] });
    const writesBack = await failWrites("**/-/api/locations", "**/-/api/places", "**/-/api/entries**");

    const entryName = `E2E dedup remap ${Date.now()}`;
    await $("#add-btn").click();
    await $("#entry-name").setValue(entryName);
    await addPlaceToExistingCrag();

    await $("#entry-submit-btn").click();
    await expect($("#entry-overlay")).not.toBeDisplayed();
    await expect(sections()).toHaveTextContent(contains(entryName));
    await expect($("#sync-line")).toBeDisplayed();

    await writesBack();
    await goOnline();
    await expect($("#sync-line")).not.toBeDisplayed();

    await expect(sections()).toHaveTextContent(contains(entryName));
    await expect($$(".place-header*=Existing Crag")).toBeElementsArrayOfSize(1);
  });

  it("an online add-place that dedups against another device's location saves the entry under it", async () => {
    const owner = await gotoLog({});
    await owner.seed({ locations: [{ id: "existing", name: "Existing Crag", country: "France" }] });

    const entryName = `E2E online dedup ${Date.now()}`;
    await $("#add-btn").click();
    await $("#entry-name").setValue(entryName);
    await addPlaceToExistingCrag();

    await $("#entry-submit-btn").click();
    await expect($("#entry-overlay")).not.toBeDisplayed();
    await expect($("#sync-line")).not.toBeDisplayed();
    await expect($$(".place-header*=Existing Crag")).toBeElementsArrayOfSize(1);
    await expect(sections()).toHaveTextContent(contains(entryName));
  });

  it("#939 -- reloading the page alone picks up an entry added on another device, no click or online event needed", async () => {
    const owner = await gotoLog();

    const entryName = `E2E boot reconcile ${Date.now()}`;
    await owner.seed({ locations: [], places: [], entries: [{ date: "2026-05-03", name: entryName }] });

    await expect(sections()).not.toHaveTextContent(contains(entryName));

    await browser.refresh();
    await expect($("climbing-entries-table")).toBeDisplayed();

    await expect(sections()).toHaveTextContent(contains(entryName));
  });

  it("#939 -- a new entry and its new place, both added on another device together, group under the real location after reload (no empty/unknown section)", async () => {
    const owner = await gotoLog();

    const entryName = `E2E new-place reconcile ${Date.now()}`;
    await owner.seed({
      locations: [{ id: "new-crag", name: "New Crag", country: "France" }],
      places: [{ id: "new-place", locationId: "new-crag", area: "Sector 1" }],
      entries: [{ id: "new-entry", placeId: "new-place", date: "2026-05-04", name: entryName }],
    });

    await browser.refresh();
    await expect($("climbing-entries-table")).toBeDisplayed();
    await expect(sections()).toHaveTextContent(contains(entryName));

    await expect(rowWith(entryName).$("./ancestor::div[@data-location-id][1]").$(".place-header")).toHaveTextContent(
      contains("New Crag"),
    );

    await expect($$(".place-header[data-location-id='']")).toBeElementsArrayOfSize(0);
  });

  it("#939 -- a manually expanded section survives a later background reconcile (online event)", async () => {
    await gotoLog();

    const row = () => rowWith("Boulder Seed");
    await expect(row()).not.toBeDisplayed();
    await $(".place-header*=Test Crag").click();
    await expect(row()).toBeDisplayed();

    await goOnline();
    await expect(row()).toBeDisplayed();
  });
});
