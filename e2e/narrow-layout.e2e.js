import { $, $$, browser, expect } from "@wdio/globals";
import { boundingBox, tap } from "./wdio-browser.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

const SEED = {
  entries: [
    { type: "boulder", name: "Boulder Seed" },
    { type: "boulder", grade: "7A", name: "Second Seed" },
  ],
};

const pageWidths = () =>
  browser.execute(() => ({ document: document.documentElement.scrollWidth, window: window.innerWidth }));

async function seededLogAt(width) {
  await browser.setViewport({ width, height: 900 });
  const owner = await claimOwner();
  await owner.seed(SEED);
  await gotoSyncedLog(owner);
}

describe("narrow layout", () => {
  for (const width of [312, 412]) {
    it(`at ${width}px, expanding a table doesn't widen the page, so the add form stays on screen (#1226)`, async () => {
      await seededLogAt(width);
      const narrow = await pageWidths();

      await tap($("#collapse-all-btn"));
      await expect($$("table")[0]).toBeDisplayed();
      expect(await pageWidths()).toEqual(narrow);

      await tap($("#add-btn"));
      await expect($("#entry-name")).toBeDisplayed();
      const modal = await boundingBox($("#entry-overlay > div"));
      expect(modal.x).toBeGreaterThanOrEqual(0);
      expect(modal.x + modal.width).toBeLessThanOrEqual(narrow.window);
      expect(await pageWidths()).toEqual(narrow);

      await tap($("#entry-close"));
      expect(await pageWidths()).toEqual(narrow);
    });
  }

  for (const width of [312, 412, 480, 768]) {
    it(`at ${width}px, the grade and date controls keep their size and wrap as whole groups (#1227)`, async () => {
      await seededLogAt(width);
      await tap($("#add-btn"));
      await expect($("#entry-name")).toBeDisplayed();

      const rem = await browser.execute(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
      const [prev, value, next, scale, date, picker] = await Promise.all(
        ["grade-prev", "grade-value-btn", "grade-next", "grade-scale-btn", "entry-date", "date-picker-mount"].map(id =>
          boundingBox($(`#${id}`)),
        ),
      );
      const row = await browser.execute(() =>
        document.getElementById("grade-value-wrap").closest(".flex-wrap").getBoundingClientRect().toJSON(),
      );

      expect(value.width).toBeGreaterThanOrEqual(5 * rem - 1);
      expect(prev.x + prev.width).toBeLessThanOrEqual(value.x);
      expect(value.x + value.width).toBeLessThanOrEqual(next.x);
      expect(next.x + next.width).toBeLessThanOrEqual(scale.x);
      expect(date.width).toBeGreaterThanOrEqual(7.25 * rem - 1);
      expect(date.x + date.width).toBeLessThanOrEqual(picker.x);
      for (const control of [prev, value, next, scale, date, picker]) {
        expect(control.x).toBeGreaterThanOrEqual(row.left - 1);
        expect(control.x + control.width).toBeLessThanOrEqual(row.right + 1);
      }
      const dateWrapped = date.y >= value.y + value.height;
      const sameRow = Math.abs(date.y - value.y) < 1;
      expect(dateWrapped || sameRow).toBe(true);
    });
  }

  it("on a narrow screen with larger text the status carousel keeps its spacing and cuts the neighbours off at the edge (#1226)", async () => {
    await seededLogAt(412);
    await browser.setViewport({ width: 360, height: 900 });
    await browser.execute(() => {
      document.documentElement.style.fontSize = "24px";
    });
    await tap($("#add-btn"));
    await expect($("#entry-name")).toBeDisplayed();

    const slot = await browser.execute(() =>
      parseFloat(getComputedStyle(document.querySelector("climbing-status-picker")).getPropertyValue("--status-slot")),
    );
    expect(slot).toBe(5 * 24);

    const strip = await boundingBox($(".status-picker-viewport"));
    expect(strip.width).toBeLessThan(3 * slot);

    const centre = await boundingBox($('.status-picker-item[data-index="6"]'));
    const right = await boundingBox($('.status-picker-item[data-index="7"]'));
    const left = await boundingBox($('.status-picker-item[data-index="5"]'));
    expect(right.x).toBeGreaterThan(centre.x + centre.width * 0.9);
    expect(right.x + right.width).toBeGreaterThan(strip.x + strip.width);
    expect(left.x).toBeLessThan(strip.x);
  });
});
