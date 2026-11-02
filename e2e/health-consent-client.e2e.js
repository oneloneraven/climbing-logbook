import { $, $$, browser, expect } from "@wdio/globals";
import { recordFetches } from "./wdio-browser.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

const PAIN = { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" };
const SEED = {
  entries: [{ id: "e1", name: "Pinch Me", painMoves: [] }],
};
const contains = text => expect.stringContaining(text);

async function athlete({ consent = false } = {}) {
  const owner = await claimOwner();
  await owner.settings({ athleteMode: true });
  if (consent) await owner.grantPainInjuryConsent();
  await owner.seed(SEED);
  return owner;
}

async function openAddForm() {
  await $("#add-btn").click();
  await expect($("#entry-overlay")).toBeDisplayed();
  await $("#entry-nav-forward").click();
}

// The real settings, changed as Playwright's route.fetch then fulfill did.
async function serveSettingsWith(owner, healthConsent) {
  const settings = await (await owner.api("GET", "settings")).json();
  const mock = await browser.mock("**/-/api/settings", { method: "GET" });
  mock.respond({ ...settings, healthConsent }, { fetchResponse: false });
  return mock;
}

describe("health consent in the client", () => {
  it("tracking off: the form shows why there are no pain controls, and links to turn it on", async () => {
    const owner = await athlete();
    await gotoSyncedLog(owner);
    await openAddForm();

    await expect($("#pain-moves-on")).not.toBeDisplayed();
    await expect($("#pain-moves-off")).toHaveTextContent(
      contains("needs you to agree to the Health Data Agreement first."),
    );
    await expect($("#pain-moves-consent-link")).toHaveAttribute("href", `/${owner.username}/account/health`);
  });

  it("tracking on: the form shows the pain controls", async () => {
    const owner = await athlete({ consent: true });
    await gotoSyncedLog(owner);
    await openAddForm();

    await expect($("#pain-moves-on")).toBeDisplayed();
    await expect($("#pain-moves-off")).not.toBeDisplayed();
  });

  it("tracking paused: the form says so instead of showing the pain controls", async () => {
    const owner = await athlete({ consent: true });
    await serveSettingsWith(owner, {
      painInjury: true,
      painInjuryUpdate: { version: "2099-01-01", required: true, changes: [] },
    });
    await gotoSyncedLog(owner);
    await openAddForm();

    await expect($("#pain-moves-on")).not.toBeDisplayed();
    await expect($("#pain-moves-off")).toHaveTextContent(
      contains("paused until you agree to the updated Health Data Agreement"),
    );
  });

  it("tracking off: the injury page explains instead of showing a report, and the hub card says so", async () => {
    const owner = await claimOwner();
    await owner.settings({ athleteMode: true });
    await browser.url(owner.url("/performance/injury"));
    const card = $("#report-insights [data-insight-tone]");
    await expect($$("#report-insights [data-insight-tone]")).toBeElementsArrayOfSize(1);
    await expect(card).toHaveAttribute("data-insight-tone", "neutral");
    await expect(card.$("[data-insight-title]")).toHaveTextContent("Health data is off");
    await expect(card.$("a*=Turn it on in My Account")).toHaveAttribute("href", `/${owner.username}/account/health`);

    await browser.url(owner.url("/performance"));
    await expect($("#insight-injury")).toHaveTextContent(contains("Agree to the Health Data Agreement in My Account"));
  });

  it("a queued climb whose pain details are refused is saved without them, with a notice", async () => {
    const owner = await athlete();
    await gotoSyncedLog(owner);

    const record = {
      id: owner.ownId("queued-pain"),
      name: "Queued with pain",
      grade: "6B",
      placeId: owner.ownId("p1"),
      type: "boulder",
      status: "send",
      date: "2026-10-01",
      painMoves: [PAIN],
    };
    await browser.execute(
      (key, record) => localStorage.setItem(key, JSON.stringify([{ kind: "entry", op: "add", record }])),
      `logbook_pending_queue:${owner.username}`,
      record,
    );
    await browser.refresh();
    await expect($("#sync-line-text")).toHaveTextContent("1 change waiting to sync");
    await $("#sync-now").click();

    await expect($("#sync-line")).not.toBeDisplayed();
    await expect($("#pain-dropped")).toBeDisplayed();
    await expect($("#sections")).toHaveTextContent(contains("Queued with pain"));
    const { entries } = await (await owner.api("GET", "entries")).json();
    expect(entries.find(e => e.id === record.id).painMoves).toEqual([]);
  });

  it("a save refused because the cached state was out of date hides the pain section, and saving again works", async () => {
    const owner = await athlete();
    const staleSettings = await serveSettingsWith(owner, { painInjury: true, painInjuryUpdate: null });
    const fetches = await recordFetches();
    await gotoSyncedLog(owner);

    await $("#add-btn").click();
    await $("#entry-name").setValue("Stale cache climb");
    await $("#place-btn").click();
    await $(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
    await $("#entry-nav-forward").click();
    await expect($("#pain-moves-on")).toBeDisplayed();
    await $("#pain-moves-add").click();
    await $('#pain-moves-list [data-field="limbSide"]').selectByAttribute("value", "foot-right");
    await $("#entry-wall-angle").selectByAttribute("value", "vert");
    await staleSettings.restore();

    const refused = fetches.next("/-/api/entries", "POST");
    await $("#entry-submit-btn-2").click();
    expect((await refused).status).toBe(400);
    await expect($("#pain-moves-off")).toBeDisplayed();
    await expect($("#entry-msg")).toHaveTextContent(
      contains("can't be saved until you've agreed to the Health Data Agreement"),
    );

    const saved = fetches.next("/-/api/entries", "POST");
    await $("#entry-submit-btn-2").click();
    const save = await saved;
    expect(save.status).toBe(201);
    expect(JSON.parse(save.body).painMoves).toEqual([]);
  });
});
