import { $, browser, expect } from "@wdio/globals";
import { goOffline, recordFetches, settle } from "./wdio-browser.js";
import { holdRequests } from "./wdio-hold.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";
import { blockIndexedDb } from "./wdio-performance.js";

const SEED = {
  locations: [
    { id: "l1", name: "Fontainbleau", country: "France" },
    { id: "l2", name: "Magic Wood", country: "Switzerland" },
  ],
  places: [
    { id: "p1", locationId: "l1", area: "Bas Cuvier" },
    { id: "p2", locationId: "l1", area: "Apremont" },
    { id: "p3", locationId: "l2", area: "Bachbett" },
  ],
  entries: [
    { id: "e1", placeId: "p1", name: "La Marie-Rose" },
    { id: "e2", placeId: "p1", name: "Le Carré d'As" },
    { id: "e3", placeId: "p2", name: "Big Boss" },
    { id: "e4", placeId: "p3", name: "Riverbed" },
  ],
};
const contains = text => expect.stringContaining(text);
const location = (owner, id) => $(`[data-location-id="${owner.ownId(id)}"]`);

async function seededOwner() {
  const owner = await claimOwner();
  await owner.seed(SEED);
  return owner;
}

async function openPlaces(owner) {
  await gotoSyncedLog(owner);
  await browser.url(owner.url("/account/places"));
  await expect(location(owner, "l1")).toHaveTextContent(contains("3 climbs"));
  // The list shows from the device first, then redraws when its pull lands, which would close an open dialog.
  await settle();
}

const serverState = async owner => ({
  locations: (await (await owner.api("GET", "locations")).json()).locations,
  places: (await (await owner.api("GET", "places")).json()).places,
  entries: (await (await owner.api("GET", "entries")).json()).entries,
});

describe("account places page", () => {
  it("lists every location with its country, areas and climbs, and is linked from My Account (#159)", async () => {
    const owner = await seededOwner();
    await openPlaces(owner);
    await expect(location(owner, "l1")).toHaveTextContent(contains("Fontainbleau"));
    await expect(location(owner, "l1")).toHaveTextContent(contains("France · 2 areas · 3 climbs"));
    await expect(location(owner, "l2")).toHaveTextContent(contains("1 area · 1 climb"));

    await browser.url(owner.url("/account"));
    await expect($("#places-link")).toHaveAttribute("href", `/${owner.username}/account/places`);
  });

  it("renames a location, changes its country and renames an area (#159)", async () => {
    const owner = await seededOwner();
    await openPlaces(owner);
    await $(`[data-edit="${owner.ownId("l1")}"]`).click();
    await $("#place-edit-name").setValue("Fontainebleau");
    await $("#place-edit-country").selectByAttribute("value", "Belgium");
    await $(`[data-area-id="${owner.ownId("p2")}"]`).setValue("Apremont Bizons");
    await $("#place-edit-save").click();

    await expect($("#place-edit-overlay")).not.toBeDisplayed();
    await expect(location(owner, "l1")).toHaveTextContent(contains("Fontainebleau"));
    await expect($("#sync-line")).not.toBeDisplayed();
    const { locations, places } = await serverState(owner);
    expect(locations.find(l => l.id === owner.ownId("l1"))).toMatchObject({
      name: "Fontainebleau",
      country: "Belgium",
    });
    expect(places.find(p => p.id === owner.ownId("p2")).area).toBe("Apremont Bizons");
  });

  it("won't rename a location to a name already used", async () => {
    const owner = await seededOwner();
    await openPlaces(owner);
    await $(`[data-edit="${owner.ownId("l1")}"]`).click();
    await $("#place-edit-name").setValue("magic wood");
    await $("#place-edit-save").click();
    await expect($("#place-edit-error")).toHaveTextContent('You already have a location called "magic wood".');
  });

  it("deletes an area, moving its climbs to another area first (#160)", async () => {
    const owner = await seededOwner();
    await openPlaces(owner);
    await $(`[data-edit="${owner.ownId("l1")}"]`).click();
    await $(`[data-delete-area="${owner.ownId("p2")}"]`).click();
    await expect($("#place-delete-text")).toHaveTextContent(
      "1 climb is at Apremont. Choose where they go: they keep everything else.",
    );
    await $("#place-delete-target").selectByAttribute("value", owner.ownId("p1"));
    await $("#place-delete-btn").click();

    await expect($(`[data-area-id="${owner.ownId("p2")}"]`)).not.toExist();
    await expect($("#sync-line")).not.toBeDisplayed();
    const { places, entries } = await serverState(owner);
    expect(places.map(p => p.id)).not.toContain(owner.ownId("p2"));
    expect(entries.find(e => e.id === owner.ownId("e3")).placeId).toBe(owner.ownId("p1"));
  });

  it("deletes a location, moving the climbs from all its areas to one place elsewhere (#160)", async () => {
    const owner = await seededOwner();
    await openPlaces(owner);
    await $(`[data-edit="${owner.ownId("l1")}"]`).click();
    await expect($("#place-delete-btn")).toHaveTextContent("Move 3 climbs and delete");
    await $("#place-delete-target").selectByAttribute("value", owner.ownId("p3"));
    await $("#place-delete-btn").click();

    await expect($("#place-edit-overlay")).not.toBeDisplayed();
    await expect(location(owner, "l1")).not.toExist();
    await expect(location(owner, "l2")).toHaveTextContent(contains("4 climbs"));
    await expect($("#sync-line")).not.toBeDisplayed();
    const { locations, entries } = await serverState(owner);
    expect(locations.map(l => l.id)).toEqual([owner.ownId("l2")]);
    expect(new Set(entries.map(e => e.placeId))).toEqual(new Set([owner.ownId("p3")]));
  });

  it("a pull that lands after the delete is confirmed keeps the moved climbs where they went (#1471)", async () => {
    const owner = await seededOwner();
    await gotoSyncedLog(owner);
    const fetches = await recordFetches();
    const releaseStalePull = await holdRequests("/-/api/entries", {
      method: "GET",
      once: true,
      answerFromWhenSent: true,
    });
    await browser.url(owner.url("/account/places"));
    await expect(location(owner, "l1")).toHaveTextContent(contains("3 climbs"));

    await $(`[data-edit="${owner.ownId("l1")}"]`).click();
    await $("#place-delete-target").selectByAttribute("value", owner.ownId("p3"));
    const deleted = fetches.next("/-/api/locations", "DELETE");
    const stalePullLanded = fetches.next("/-/api/entries?since=", "GET");
    await $("#place-delete-btn").click();
    await deleted;
    await releaseStalePull();
    await stalePullLanded;

    await expect(location(owner, "l2")).toHaveTextContent(contains("4 climbs"));
  });

  it("offline, a rename shows at once and syncs by itself once the connection is back (#159)", async () => {
    const owner = await seededOwner();
    await openPlaces(owner);
    const backOnline = await goOffline();
    await $(`[data-edit="${owner.ownId("l2")}"]`).click();
    await $("#place-edit-name").setValue("Magic Wood (Averstal)");
    await $("#place-edit-save").click();

    await expect(location(owner, "l2")).toHaveTextContent(contains("Magic Wood (Averstal)"));
    await expect($("#sync-line-text")).toHaveTextContent("1 change waiting to sync");

    await backOnline();
    await expect($("#sync-line")).not.toBeDisplayed();
    const { locations } = await serverState(owner);
    expect(locations.find(l => l.id === owner.ownId("l2")).name).toBe("Magic Wood (Averstal)");
  });

  it("works from the server's copy on a device that keeps no data, and saves changes (#159)", async () => {
    const owner = await seededOwner();
    await blockIndexedDb();
    await browser.url(owner.url("/account/places"));
    await expect(browser).toHaveUrl(owner.url("/account/places"));
    await expect(location(owner, "l1")).toHaveTextContent(contains("France · 2 areas · 3 climbs"));

    await $(`[data-edit="${owner.ownId("l1")}"]`).click();
    await $("#place-edit-name").setValue("Fontainebleau");
    await $("#place-edit-save").click();

    await expect(location(owner, "l1")).toHaveTextContent(contains("Fontainebleau"));
    await expect($("#sync-line")).not.toBeDisplayed();
    const { locations } = await serverState(owner);
    expect(locations.find(l => l.id === owner.ownId("l1")).name).toBe("Fontainebleau");
  });

  it("a change the server refuses shows as a failed write that can be discarded (#160)", async () => {
    const owner = await seededOwner();
    await openPlaces(owner);
    const deletes = await browser.mock("**/-/api/places", { method: "DELETE" });
    deletes.respond({ error: "Not allowed" }, { statusCode: 400, fetchResponse: false });
    await $(`[data-edit="${owner.ownId("l1")}"]`).click();
    await $(`[data-delete-area="${owner.ownId("p2")}"]`).click();
    await $("#place-delete-target").selectByAttribute("value", owner.ownId("p1"));
    await $("#place-delete-btn").click();
    await $("#place-edit-cancel").click();

    const banner = $("#failed-writes");
    await expect(banner).toHaveTextContent(contains("Couldn't save the deletion of “Apremont”"));
    await banner.$('role/button[name="Discard"]').click();
    await expect(banner).not.toBeDisplayed();
  });
});
