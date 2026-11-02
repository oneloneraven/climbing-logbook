import { $, browser, expect } from "@wdio/globals";
import { daysAgo } from "./owner.js";
import { recordNavigations } from "./wdio-browser.js";
import { gotoSyncedLog } from "./wdio-owner.js";
import { athlete, blockIndexedDb } from "./wdio-performance.js";

const REPORTS = [
  { path: "/performance/pyramid", root: "climbing-grade-pyramid" },
  { path: "/performance/injury", root: "#injury-log-root" },
  { path: "/performance/strengths", root: "#strengths-root" },
  { path: "/performance/trends", root: "#trends-root" },
  { path: "/performance/gap", root: "#gap-root" },
  { path: "/performance/rpe", root: "#rpe-root" },
];
const contains = text => expect.stringContaining(text);

async function syncedAthlete(entries = [{ grade: "6B" }]) {
  const owner = await athlete();
  await owner.seed({ entries });
  await gotoSyncedLog(owner);
  return owner;
}

async function cutOffTheApi() {
  const api = await browser.mock("**/-/api/**");
  api.abort();
}

const reportRequests = () => browser.mock("**/-/api/performance/**");

describe("Reports and map counts on the device (ADR-0031)", () => {
  it("every report renders from the device with no connection to the API", async () => {
    const owner = await syncedAthlete();
    await cutOffTheApi();

    for (const { path, root } of REPORTS) {
      await browser.url(owner.url(path));
      await expect($(root)).toBeDisplayed({ message: path });
      await expect($("#performance-offline")).not.toBeDisplayed({ message: path });
    }
  });

  it("computes on the device, so changing the window asks the server for nothing", async () => {
    const owner = await syncedAthlete([{ grade: "6B", date: daysAgo(200) }]);
    const requests = await reportRequests();

    await browser.url(owner.url("/performance/trends"));
    await expect($("#trends-root")).toHaveTextContent(contains("You have logged no sends"));
    await $('[data-window="52w"]').click();
    await expect($("#trends-root")).toHaveTextContent(contains("1 send logged in this window"));
    expect(requests.calls).toEqual([]);
  });

  it("counts a climb that's still waiting to sync", async () => {
    const owner = await syncedAthlete([]);
    await browser.execute(
      (key, record) => localStorage.setItem(key, JSON.stringify([{ kind: "entry", op: "add", record }])),
      `logbook_pending_queue:${owner.username}`,
      {
        id: "queued-send",
        placeId: owner.ownId("p1"),
        type: "boulder",
        status: "send",
        grade: "6B",
        gradeScale: "font",
        date: daysAgo(1),
        name: "Queued send",
        firstAttempt: false,
      },
    );
    await cutOffTheApi();

    await browser.url(owner.url("/performance/trends"));
    await expect($("#trends-root")).toHaveTextContent(contains("1 send logged in this window"));
  });

  it("picks up a climb logged on another device once the background sync lands", async () => {
    const owner = await syncedAthlete([]);
    await owner.api("POST", "locations", { id: owner.ownId("l1"), name: "Test Crag", country: "United Kingdom" });
    await owner.api("POST", "places", { id: owner.ownId("p1"), locationId: owner.ownId("l1"), area: "" });
    await owner.api("POST", "entries", {
      id: owner.ownId("elsewhere"),
      placeId: owner.ownId("p1"),
      type: "boulder",
      status: "send",
      grade: "6B",
      date: daysAgo(1),
      name: "Logged elsewhere",
    });

    await browser.url(owner.url("/performance/trends"));
    await expect($("#trends-root")).toHaveTextContent(contains("1 send logged in this window"));
  });

  it("on a device that keeps no data, the report comes from the server", async () => {
    await blockIndexedDb();
    const owner = await syncedAthlete();
    const requests = await reportRequests();

    await browser.url(owner.url("/performance/trends"));
    await expect($("#trends-root")).toHaveTextContent(contains("1 send logged in this window"));
    expect(requests.calls.some(call => call.request.url.includes("/-/api/performance/volume?"))).toBe(true);
  });

  it("an unsynced device syncs first, then comes back to the report", async () => {
    const owner = await athlete();
    await owner.seed({ entries: [{ grade: "6B" }] });
    const navigations = await recordNavigations();

    await browser.url(owner.url("/performance/gap"));
    await expect($("#gap-root [data-combo-chart]")).toBeDisplayed();
    const visited = navigations.map(url => url.pathname);
    expect(visited).toContain(`/${owner.username}/sync`);
    expect(visited.at(-1)).toBe(`/${owner.username}/performance/gap`);
  });

  it("the map counts its pins on the device with no connection to the API", async () => {
    const owner = await syncedAthlete();
    await cutOffTheApi();

    await browser.url(owner.url("/view/map"));
    await expect($("#subtitle")).toHaveTextContent(contains("1 Country"));
  });

  it("the map picks up a climb logged on another device once the background sync lands", async () => {
    const owner = await syncedAthlete([]);
    await owner.api("POST", "locations", { id: owner.ownId("l1"), name: "Test Crag", country: "United Kingdom" });
    await owner.api("POST", "places", { id: owner.ownId("p1"), locationId: owner.ownId("l1"), area: "" });
    await owner.api("POST", "entries", {
      id: owner.ownId("elsewhere"),
      placeId: owner.ownId("p1"),
      type: "boulder",
      status: "send",
      grade: "6B",
      date: daysAgo(1),
      name: "Logged elsewhere",
    });
    const counts = await browser.mock("**/-/api/map/counts**");

    await browser.url(owner.url("/view/map"));
    await expect($("#subtitle")).toHaveTextContent(contains("1 Country"));
    expect(counts.calls).toEqual([]);
  });

  it("on a device that keeps no data, the map's counts come from the server", async () => {
    await blockIndexedDb();
    const owner = await syncedAthlete();
    const counts = await browser.mock("**/-/api/map/counts**");

    await browser.url(owner.url("/view/map"));
    await counts.waitForResponse();
    await expect($("#subtitle")).toHaveTextContent(contains("1 Country"));
  });
});
