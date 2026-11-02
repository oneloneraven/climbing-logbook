import { $, browser, expect } from "@wdio/globals";
import { boundingBox, browserFetch, tap, waitForPath, waitForUrl } from "./wdio-browser.js";
import { claimOwner } from "./wdio-owner.js";

const DEMO = "http://my.localhost:8787/intermediatedemo";
const dialog = () => $('[role="dialog"][aria-labelledby="tour-title"]');
const button = name => dialog().$(`role/button[name="${name}"]`);
const next = () => button("Next");
const title = () => dialog().$("role/heading");
const contains = text => expect.stringContaining(text);
const mainIsInert = () => browser.execute(() => document.getElementById("main").inert);

const waitForTourUrl = (path, step) =>
  waitForUrl(url => url.pathname === `/intermediatedemo${path}` && url.searchParams.get("tour") === step, path);

async function startFromMyAccount() {
  const owner = await claimOwner();
  await browser.url(owner.url("/account"));
  await tap($("#account-options").$("a*=Take the tour"));
  return owner;
}

async function expectStep(n, heading) {
  await expect(dialog()).toHaveTextContent(contains(`${n} of 11`));
  await expect(title()).toHaveTextContent(heading);
}

describe("tour", () => {
  beforeEach(() => browser.setViewport({ width: 312, height: 680 }));

  it("My Account's Take the tour card starts the tour on the demo logbook", async () => {
    await startFromMyAccount();

    await waitForTourUrl("/log", "1");
    await expect(dialog()).toBeDisplayed();
    await expect(title()).toBeFocused();
    await expectStep(1, "Discipline");
    await expect(dialog()).toHaveTextContent(contains("shown together"));
    await expect(button("Back")).not.toBeDisplayed();
  });

  it("the same eleven steps for everyone, across the log, the combined view and Performance", async () => {
    const owner = await startFromMyAccount();
    await expectStep(1, "Discipline");

    await tap(next());
    await expectStep(2, "Log a climb");
    await expect($("#entry-overlay")).not.toBeDisplayed();

    await tap(next());
    await expectStep(3, "Where you climbed");
    await expect($("#entry-overlay")).toBeDisplayed();

    await tap(next());
    await expectStep(4, "How did it go?");
    await expect($("#entry-overlay")).toBeDisplayed();

    await tap(button("Back"));
    await expectStep(3, "Where you climbed");
    await tap(next());

    await tap(next());
    await expectStep(5, "Working offline");
    await expect($("#tour-sync-line")).toHaveTextContent(expect.stringMatching(/3 changes waiting to sync\s*Sync now/));
    await expect($("#sync-line")).not.toBeDisplayed();
    await expect($("#entry-overlay")).not.toBeDisplayed();

    await tap(next());
    await expectStep(6, "Find a climb");
    await expect($("#tour-sync-line")).not.toExist();

    await tap(next());
    await waitForTourUrl("/view", "7");
    await expectStep(7, "Your combined logbook");
    await expect($("#panel-logbook")).toBeDisplayed();

    await tap(next());
    await waitForTourUrl("/view/map", "8");
    await expectStep(8, "Your map");
    await expect($("#panel-map")).toBeDisplayed();
    const card = await boundingBox(dialog());
    expect(card.y + card.height).toBeGreaterThan(600);

    await tap(next());
    await waitForTourUrl("/log", "9");
    await expectStep(9, "Performance Insights");
    await expect(dialog()).toHaveTextContent(contains("Turn on Athlete Mode in My Account"));
    await expect($("#performance-tab")).toBeDisplayed();

    await tap(next());
    await expectStep(10, "Log more detail");
    await expect($("#entry-nav-forward")).toBeDisplayed();

    await tap(next());
    await waitForTourUrl("/performance", "11");
    await expectStep(11, "Your reports");

    await tap(button("Done"));
    await waitForPath(`/${owner.username}/account`);
    await expect(dialog()).not.toExist();
  });

  it("Find a climb spotlights all three buttons together", async () => {
    await browser.url(`${DEMO}/log?tour=6`);
    await expectStep(6, "Find a climb");
    const search = await boundingBox($("#search-btn"));
    const expand = await boundingBox($("#collapse-all-btn"));
    const box = await boundingBox($("#tour-spot"));
    expect(box.x).toBeLessThanOrEqual(search.x);
    expect(box.x + box.width).toBeGreaterThanOrEqual(expand.x + expand.width);
  });

  it("the tour doesn't run on your own logbook", async () => {
    const owner = await claimOwner();
    await browser.url(owner.url("/log?tour=1"));
    await expect($("#add-btn")).toBeDisplayed();
    await expect(dialog()).not.toExist();
  });

  it("a visitor with no session can take it too", async () => {
    await browser.url(`${DEMO}/log?tour=10`);
    await expectStep(10, "Log more detail");
    await expect($("#entry-nav-forward")).toBeDisplayed();
  });

  it("Skip tour leaves from any step without changing anything", async () => {
    const owner = await startFromMyAccount();
    await tap(next());
    await tap(button("Skip tour"));
    await waitForPath(`/${owner.username}/account`);
  });

  it("Escape ends the tour and the page is usable again", async () => {
    await browser.url(`${DEMO}/log?tour=1`);
    await expect(dialog()).toBeDisplayed();
    expect(await mainIsInert()).toBe(true);
    await browser.keys("Escape");
    await expect(dialog()).not.toExist();
    expect(new URL(await browser.getUrl()).search).toBe("");
    expect(await mainIsInert()).toBe(false);
    await tap($("#add-btn"));
    await expect($("#entry-overlay")).toBeDisplayed();
  });

  it("the tour doesn't change the page's width", async () => {
    const owner = await startFromMyAccount();
    await expect(dialog()).toBeDisplayed();
    const during = await browser.execute(() => document.documentElement.scrollWidth);

    await browser.keys("Escape");
    await waitForPath(`/${owner.username}/account`);
    await browser.url(`${DEMO}/log`);
    await expect($("#add-btn")).toBeDisplayed();
    expect(await browser.execute(() => document.documentElement.scrollWidth)).toBe(during);
  });

  it("a step that can't run ends the tour instead of leaving the page inert", async () => {
    const page = `${DEMO}/log?tour=3`;
    const html = await (await browserFetch(page)).text();
    const log = await browser.mock(page);
    log.respond(html.replace('id="add-btn"', 'id="add-btn-gone"'), {
      headers: { "content-type": "text/html; charset=utf-8" },
      fetchResponse: false,
    });
    await browser.url(page);
    await expect(dialog()).not.toExist();
    expect(await mainIsInert()).toBe(false);
  });
});
