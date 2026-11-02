import { $, $$, browser, expect } from "@wdio/globals";
import { holdRequests } from "./wdio-hold.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";
import { blockIndexedDb } from "./wdio-performance.js";

const contains = text => expect.stringContaining(text);

// A device that keeps no copy waits on the server, so every view shows its loading state first (#1387).
async function serverOnlyAthlete(entries) {
  const owner = await claimOwner();
  await owner.settings({ athleteMode: true });
  await owner.seed({ entries });
  await blockIndexedDb();
  await gotoSyncedLog(owner);
  return owner;
}

describe("loading states", () => {
  it("a report waiting on the server shows a spinner, never the no-data message (#1387)", async () => {
    const owner = await serverOnlyAthlete([{ grade: "6B" }]);

    let release = await holdRequests("/-/api/performance/pyramid");
    await browser.url(owner.url("/performance/pyramid"));
    const pyramidSpinner = $("climbing-grade-pyramid [data-loading]");
    await expect(pyramidSpinner).toBeDisplayed();
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const spinner = document.querySelector("climbing-grade-pyramid [data-loading]");
          return !!spinner && getComputedStyle(spinner).opacity === "1";
        }),
      { timeoutMsg: "the spinner never faded in" },
    );
    await expect($("#pyramid")).not.toHaveTextContent(contains("You have logged no sends"));
    await release();
    await expect($("#pyramid")).toHaveTextContent(contains("6B"));
    await expect(pyramidSpinner).not.toExist();

    release = await holdRequests("/-/api/performance/gap");
    await browser.url(owner.url("/performance/gap"));
    await expect($("#gap-root [data-loading]")).toBeDisplayed();
    await expect($("#report-insights")).not.toExist();
    await release();
    await expect($("#gap-root [data-combo-chart]")).toBeDisplayed();
    await expect($("#gap-root [data-loading]")).not.toExist();
  });

  it("the logbook shows a spinner while its climbs load from the server", async () => {
    const owner = await serverOnlyAthlete([{ name: "Waited for" }]);

    const release = await holdRequests("/-/api/entries");
    await browser.url(owner.url("/log"));
    await expect($("#sections [data-loading]")).toBeDisplayed();
    await expect($("#sections")).not.toHaveTextContent(contains("Nothing to show here"));
    await release();
    await expect($("#sections")).toHaveTextContent(contains("Waited for"));
    await expect($("#sections [data-loading]")).not.toExist();
  });

  it("an account with no climbs gets the no-data message once that's confirmed, and no spinner", async () => {
    const owner = await serverOnlyAthlete([]);

    await browser.url(owner.url("/performance/pyramid"));
    await expect($("#pyramid")).toHaveTextContent(contains("You have logged no sends"));
    await expect($("climbing-grade-pyramid [data-loading]")).not.toExist();
  });

  it("the map shows a spinner over itself until its counts arrive, then the pins", async () => {
    const owner = await serverOnlyAthlete([{ name: "Pinned" }]);

    const release = await holdRequests("/-/api/map/counts");
    await browser.url(owner.url("/view/map"));
    await expect($("#map-svg")).toBeDisplayed();
    await expect($("#map-container [data-loading]")).toBeDisplayed();
    await release();
    await expect($$("#map-svg [data-pin-country]")).toBeElementsArrayOfSize(1);
    await expect($("#map-container [data-loading]")).not.toExist();
  });

  it("a failed first load says it couldn't load, not that there's nothing there", async () => {
    const owner = await serverOnlyAthlete([{ name: "Out of reach" }]);
    for (const pattern of ["**/-/api/entries**", "**/-/api/map/counts**"]) (await browser.mock(pattern)).abort();

    await browser.url(owner.url("/log"));
    await expect($("#sections")).toHaveTextContent(contains("Couldn't load the logbook"));
    await expect($("#sections")).not.toHaveTextContent(contains("Nothing to show here"));

    await browser.url(owner.url("/view/map"));
    await expect($("#map-container")).toHaveTextContent(contains("Couldn't load the climbs on the map"));
    await expect($("#map-container [data-loading]")).not.toExist();
  });
});
