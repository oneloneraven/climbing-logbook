import { $, browser, expect } from "@wdio/globals";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

describe("status icons", () => {
  it("Flash matches Archived's size, and Send, Project and Check out run 2px larger, so none looks off", async () => {
    const owner = await claimOwner();
    await gotoSyncedLog(owner);
    await $("#add-btn").click();
    await expect($(".status-picker")).toBeDisplayed();

    // Measured in each icon's own viewBox units: Firefox's getBoundingClientRect on SVG shapes differs from Chromium's.
    const longestInkSide = await browser.execute(() => {
      const sides = {};
      for (const item of document.querySelectorAll(".status-picker-item[data-status]")) {
        if (item.dataset.status in sides) continue;
        const svg = item.querySelector("svg");
        const toSvg = svg.getScreenCTM().inverse();
        const corners = [...svg.querySelectorAll("path, circle, ellipse, rect, polygon")].flatMap(shape => {
          const box = shape.getBBox();
          if (!box.width && !box.height) return [];
          const matrix = toSvg.multiply(shape.getScreenCTM());
          return [
            [box.x, box.y],
            [box.x + box.width, box.y],
            [box.x, box.y + box.height],
            [box.x + box.width, box.y + box.height],
          ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
        });
        const width = Math.max(...corners.map(p => p.x)) - Math.min(...corners.map(p => p.x));
        const height = Math.max(...corners.map(p => p.y)) - Math.min(...corners.map(p => p.y));
        sides[item.dataset.status] = (Math.max(width, height) * 24) / svg.viewBox.baseVal.width;
      }
      return sides;
    });

    const expected = {
      flash: longestInkSide.archived,
      send: longestInkSide.archived + 2,
      project: longestInkSide.archived + 2,
      checkout: longestInkSide.archived + 2,
    };
    const offSize = Object.entries(expected)
      .filter(([icon, side]) => Math.abs(longestInkSide[icon] - side) > 1)
      .map(([icon]) => icon);
    expect(offSize).toEqual([]);
  });
});
