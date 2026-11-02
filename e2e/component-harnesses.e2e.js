import { $, browser, expect } from "@wdio/globals";

const viewBox = async () => (await $("#map-svg").getAttribute("viewBox")).split(" ").map(Number);

async function openMapHarness() {
  await browser.url("/e2e-fixtures/map-harness.html");
  await expect($("#map-svg")).toBeDisplayed();
}

describe("component harnesses", () => {
  it("climbing-grade-pyramid: renders an inline Sources section", async () => {
    await browser.url("/e2e-fixtures/pyramid-harness.html");

    await expect($("climbing-grade-pyramid #pyramid")).toBeDisplayed();
    await expect($("climbing-grade-pyramid")).toHaveTextContent(expect.stringContaining("Sources"));
    await expect($("climbing-grade-pyramid")).toHaveTextContent(expect.stringContaining("Hörst"));
  });

  it("map-view.js: zoom/pan controls appear once the map has loaded", async () => {
    await openMapHarness();

    await expect($("#map-zoom-controls")).toBeDisplayed();
    await expect($("#map-pan-controls")).toBeDisplayed();
  });

  it("map-view.js: zoom in/out buttons change the visible viewBox", async () => {
    await openMapHarness();
    const width = async () => (await viewBox())[2];

    const initialWidth = await width();
    await $("#map-zoom-in").click();
    await browser.waitUntil(async () => (await width()) < initialWidth);

    const zoomedWidth = await width();
    await $("#map-zoom-out").click();
    await browser.waitUntil(async () => (await width()) > zoomedWidth);
  });

  it("map-view.js: pan buttons shift the visible viewBox", async () => {
    await openMapHarness();

    await $("#map-zoom-in").click();
    const [beforeX] = await viewBox();
    await $("#map-pan-right").click();
    const [afterX] = await viewBox();
    expect(afterX).toBeGreaterThan(beforeX);
  });

  it("map-view.js: clicking a pin opens the popover with that country's stats, closes on its own close button", async () => {
    await openMapHarness();

    await $('[data-pin-country="France"]').click();

    const popover = $("#map-pin-popover");
    await expect(popover).toBeDisplayed();
    await expect(popover).toHaveTextContent(expect.stringContaining("France"));

    await $("#map-pin-popover-close").click();
    await expect(popover).not.toBeDisplayed();
  });

  it("map-view.js: switching the map projection variant re-renders without error", async () => {
    await openMapHarness();

    await $("#map-variant-select").selectByAttribute("value", "americas");
    await expect($("#map-svg")).toBeDisplayed();
    await expect($("#map-variant-select")).toHaveValue("americas");
  });
});
