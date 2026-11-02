import { $, $$, browser, expect } from "@wdio/globals";
import { boundingBox } from "./wdio-browser.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

const SEED = {
  entries: Array.from({ length: 30 }, (_, i) => ({ type: "boulder", name: `Scroll Seed ${i + 1}` })),
};

describe("overlay scroll", () => {
  it("scrolling past the end of the add form doesn't scroll the logbook behind it (#1233)", async () => {
    await browser.setViewport({ width: 412, height: 600 });
    const owner = await claimOwner();
    await owner.seed(SEED);
    await gotoSyncedLog(owner);
    await $("#collapse-all-btn").click();
    await expect($$("table")[0]).toBeDisplayed();
    await browser.execute(() => window.scrollTo(0, 200));

    await $("#add-btn").click();
    await expect($("#entry-name")).toBeDisplayed();
    const behind = await browser.execute(() => window.scrollY);
    await browser.execute(() => {
      const overlay = document.getElementById("entry-overlay");
      overlay.scrollTop = overlay.scrollHeight;
    });

    const box = await boundingBox($("#entry-overlay"));
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    for (const deltaY of [400, -400, 400]) {
      await browser.action("wheel").scroll({ x, y, deltaX: 0, deltaY, origin: "viewport" }).perform();
      await browser.pause(300);
      expect(await browser.execute(() => window.scrollY)).toBe(behind);
    }
  });
});
