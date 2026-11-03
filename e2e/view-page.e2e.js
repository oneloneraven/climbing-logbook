import { $, $$, browser, expect } from "@wdio/globals";
import { expectEventually, waitForOpenedTab, waitForPath } from "./wdio-browser.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

const SEED = {
  entries: [
    { type: "boulder", name: "Boulder Climb" },
    { type: "sport", grade: "6a", name: "Sport Climb" },
  ],
};

// The group headings are uppercase in CSS, which browsers disagree on including in the name, so match on markup and text.
const group = key => $(`#discipline-popover [role="group"][aria-labelledby="discipline-group-${key}"]`);

async function option(name) {
  for (const candidate of await $$('#discipline-popover [role="option"]')) {
    if ((await candidate.getProperty("textContent")).trim() === name) return candidate;
  }
  throw new Error(`No ${name} option`);
}

async function chooseFromPicker(name) {
  await $("#discipline-btn").click();
  await (await option(name)).click();
}

async function seededOwnerOnCombined() {
  const owner = await claimOwner();
  await owner.seed(SEED);
  await gotoSyncedLog(owner);
  await chooseFromPicker("Combined");
  await waitForPath(`/${owner.username}/view`);
  return owner;
}

const savedDiscipline = async owner => (await (await owner.api("GET", "settings")).json()).activeDiscipline;

describe("view page", () => {
  it("the dropdown groups the disciplines under Log and Combined under View", async () => {
    const owner = await claimOwner();
    await owner.seed(SEED);
    await gotoSyncedLog(owner);
    await $("#discipline-btn").click();

    const optionsIn = key => async () =>
      Promise.all(
        await group(key)
          .$$('[role="option"]')
          .map(o => o.getProperty("textContent").then(t => t.trim())),
      );
    await expect(group("log")).toHaveTextContent(expect.stringMatching(/^Log/));
    await expect(group("view")).toHaveTextContent(expect.stringMatching(/^View/));
    await expectEventually(optionsIn("log"), ["Boulder", "Sport"]);
    await expectEventually(optionsIn("view"), ["Combined"]);
  });

  it("Combined opens /view: every discipline together, read-only, with its own tabs", async () => {
    await seededOwnerOnCombined();

    await expect($("#discipline-btn-label")).toHaveTextContent("Combined");
    await $("#collapse-all-btn").click();
    await expect($("#sections")).toHaveTextContent(expect.stringContaining("Boulder Climb"));
    await expect($("#sections")).toHaveTextContent(expect.stringContaining("Sport Climb"));

    await expect($("#add-btn")).not.toExist();
    await expect($$("#sections [data-edit-id], #sections .edit-btn")).toBeElementsArrayOfSize(0);
    await expect($("climbing-tab-bar").$("a*=Logbook")).toHaveAttribute("aria-current", "page");
    await expect($("climbing-tab-bar").$("a*=Performance")).not.toExist();

    await $("#discipline-btn").click();
    await expect(await option("Combined")).toHaveAttribute("aria-selected", "true");
    await expect(await option("Boulder")).toHaveAttribute("aria-selected", "false");
  });

  it("choosing a discipline from /view opens /log on it", async () => {
    const owner = await seededOwnerOnCombined();

    await chooseFromPicker("Sport");
    await waitForPath(`/${owner.username}/log`);
    await expect($("#discipline-btn-label")).toHaveTextContent("Sport");
    await browser.waitUntil(async () => (await savedDiscipline(owner)) === "sport");
  });

  it("choosing Combined doesn't change the saved discipline", async () => {
    const owner = await claimOwner();
    await owner.seed(SEED);
    await owner.settings({ activeDiscipline: "boulder" });
    await gotoSyncedLog(owner);

    await chooseFromPicker("Combined");
    await waitForPath(`/${owner.username}/view`);
    await expect($("#discipline-btn-label")).toHaveTextContent("Combined");

    expect(await savedDiscipline(owner)).toBe("boulder");
    await browser.url(owner.url("/log"));
    await expect($("#discipline-btn-label")).toHaveTextContent("Boulder");
  });

  it("a demo account's combined view needs no session", async () => {
    await browser.url("http://my.localhost:8787/intermediatedemo/view");
    await expect($("#discipline-btn-label")).toHaveTextContent("Combined");
    await expect($$(".place-header[data-location-id]")[0]).toBeDisplayed();
  });

  it("the Map tab swaps to the combined map in place, and Back returns to the logbook", async () => {
    const owner = await seededOwnerOnCombined();
    await browser.execute(() => {
      window.e2eSamePage = true;
    });

    await $("climbing-tab-bar").$("a*=Map").click();
    await expect(browser).toHaveUrl(expect.stringMatching(new RegExp(`/${owner.username}/view/map$`)));
    await expect($("#map-svg")).toBeDisplayed();
    await expect($("#panel-logbook")).not.toBeDisplayed();
    await expect($("climbing-tab-bar").$("a*=Map")).toHaveAttribute("aria-current", "page");
    await expect($("#subtitle")).toHaveTextContent(expect.stringContaining("1 Country"));

    await browser.back();
    await expect(browser).toHaveUrl(expect.stringMatching(new RegExp(`/${owner.username}/view$`)));
    await expect($("#panel-logbook")).toBeDisplayed();
    await expect($("#panel-map")).not.toBeDisplayed();
    await expect($("climbing-tab-bar").$("a*=Logbook")).toHaveAttribute("aria-current", "page");
    expect(await browser.execute(() => window.e2eSamePage)).toBe(true);
  });

  it("/view/map opens straight onto the map", async () => {
    const owner = await claimOwner();
    await owner.seed(SEED);
    await gotoSyncedLog(owner);
    await browser.url(owner.url("/view/map"));
    await expect($("#map-svg")).toBeDisplayed();
    await expect($("#panel-logbook")).not.toBeDisplayed();
    await expect($("#discipline-btn-label")).toHaveTextContent("Combined");
  });

  it("the menu's View public logbook opens the public profile in a new tab, and only while it's public", async () => {
    const owner = await claimOwner();
    await owner.seed(SEED);
    await gotoSyncedLog(owner);
    await $("#header-menu-btn").click();
    const link = $("#public-logbook-link");
    await expect(link).toBeDisplayed();
    await expect($('role/link[name="View public logbook (opens in a new tab)"]')).toHaveId("public-logbook-link");

    await link.click();
    const profile = await waitForOpenedTab();
    expect(new URL(profile.url).pathname).toBe(`/${owner.username}`);
    await browser.browsingContextClose({ context: profile.context });

    await owner.settings({ logbookPublic: false });
    await browser.url(owner.url("/view"));
    await $("#header-menu-btn").click();
    await expect($("#header-menu-popover")).toBeDisplayed();
    await expect(link).not.toBeDisplayed();
  });
});
