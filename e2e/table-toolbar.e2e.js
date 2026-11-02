import { $, $$, browser, expect } from "@wdio/globals";
import { boundingBox } from "./wdio-browser.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

const SEED = {
  entries: [
    { type: "boulder", name: "Boulder Seed" },
    { type: "boulder", grade: "7A", name: "Second Seed" },
  ],
};

async function rowLayout() {
  for (const id of ["#add-btn", "#search-btn", "#filter-btn", "#collapse-all-btn"]) await $(id).waitForDisplayed();
  const [add, search, searchBtn, filter, expand, sections] = await Promise.all(
    ["#add-btn", "#search", "#search-btn", "#filter-btn", "#collapse-all-btn", "#sections"].map(id =>
      boundingBox($(id)),
    ),
  );
  return { add, search, searchBtn, filter, expand, sections };
}

async function seededLog(width) {
  if (width) await browser.setViewport({ width, height: 800 });
  const owner = await claimOwner();
  await owner.seed(SEED);
  await gotoSyncedLog(owner);
}

const scrollWidth = () => browser.execute(() => document.documentElement.scrollWidth);

describe("table toolbar", () => {
  for (const width of [312, 479]) {
    it(`at ${width}px the search box opens on its own row, the width of the tables`, async () => {
      await seededLog(width);

      await expect($("#search")).not.toBeDisplayed();
      await $("#search-btn").click();
      await expect($("#search")).toBeFocused();

      const { add, search, searchBtn, filter, expand, sections } = await rowLayout();
      for (const control of [searchBtn, filter, expand]) expect(Math.abs(control.y - add.y)).toBeLessThan(1);
      expect(searchBtn.x).toBeLessThan(filter.x);
      expect(filter.x).toBeLessThan(expand.x);
      expect(search.y).toBeGreaterThanOrEqual(add.y + add.height);
      expect(Math.abs(search.x - sections.x)).toBeLessThan(1);
      expect(Math.abs(search.width - sections.width)).toBeLessThan(1);
      expect(await scrollWidth()).toBe(width);
    });
  }

  for (const width of [480, 1024]) {
    it(`at ${width}px the search box opens beside the buttons without moving anything`, async () => {
      await seededLog(width);

      const closed = await rowLayout();
      await $("#search-btn").click();
      const open = await rowLayout();

      for (const id of ["add", "searchBtn", "filter", "expand"]) expect(open[id]).toEqual(closed[id]);
      expect(Math.abs(open.search.y - open.add.y)).toBeLessThan(1);
      expect(open.search.x).toBeGreaterThan(open.add.x + open.add.width);
      expect(open.search.x + open.search.width).toBeLessThanOrEqual(open.searchBtn.x);
      expect(open.search.width).toBeGreaterThanOrEqual(160);
      expect(await scrollWidth()).toBe(width);
    });
  }

  it("every control in the row is the same height", async () => {
    await seededLog();
    await $("#search-btn").click();
    const { add, search, searchBtn, filter, expand } = await rowLayout();
    for (const control of [search, searchBtn, filter, expand]) expect(control.height).toBe(add.height);
  });

  it("hiding the search box clears the search", async () => {
    await seededLog();
    await $("#collapse-all-btn").click();

    await $("#search-btn").click();
    await $("#search").setValue("Second");
    await expect($("#sections")).not.toHaveTextContent(expect.stringContaining("Boulder Seed"));
    await expect($("#search-btn")).toHaveAttribute("aria-label", "Close search");

    await $("#search-btn").click();
    await expect($("#search")).not.toBeDisplayed();
    await expect($("#sections")).toHaveTextContent(expect.stringContaining("Boulder Seed"));
    await expect($("#search-btn")).toHaveAttribute("aria-label", "Search");

    await $("#search-btn").click();
    await expect($("#search")).toHaveValue("");
  });

  it("Escape in the search box closes it, clears it and returns to the button", async () => {
    await seededLog();
    await $("#collapse-all-btn").click();
    await $("#search-btn").click();
    await $("#search").setValue("Second");

    await browser.keys("Escape");
    await expect($("#search")).not.toBeDisplayed();
    await expect($("#search-btn")).toBeFocused();
    await expect($("#sections")).toHaveTextContent(expect.stringContaining("Boulder Seed"));
  });

  it("Expand/Collapse names itself for what it will do", async () => {
    await seededLog();
    const button = $("#collapse-all-btn");

    await expect(button).toHaveAttribute("aria-label", "Expand all");
    await button.click();
    await expect(button).toHaveAttribute("aria-label", "Collapse all");
    await expect($$("table")[0]).toBeDisplayed();
    await button.click();
    await expect(button).toHaveAttribute("aria-label", "Expand all");
  });

  for (const width of [312, 480, 1024]) {
    it(`at ${width}px the filter panel opens on screen, lined up with the right of the tables`, async () => {
      await browser.setViewport({ width, height: 900 });
      const owner = await claimOwner();
      await owner.seed(SEED);
      await gotoSyncedLog(owner);

      await $("#filter-btn").click();
      await expect($("#filter-panel")).toBeDisplayed();
      const panel = await boundingBox($("#filter-panel"));
      const sections = await boundingBox($("#sections"));
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(width);
      expect(Math.abs(panel.x + panel.width - (sections.x + sections.width))).toBeLessThan(1);
      expect(await scrollWidth()).toBe(width);
    });
  }
});
