import { $, browser, expect } from "@wdio/globals";
import { afterThisTest, boundingBox, expectEventually } from "./wdio-browser.js";
import { axeViolations } from "./wdio-axe.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

const SEED = {
  entries: [
    {
      id: "e1",
      placeId: "p1",
      type: "boulder",
      status: "project",
      grade: "6A",
      gradeScale: "font",
      date: "2026-05-01",
      name: "Carousel Seed",
    },
  ],
  places: [{ id: "p1", locationId: "l1", area: "" }],
  locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
};

const centredStatus = () =>
  browser.execute(() => {
    const viewport = document.querySelector(".status-picker-viewport").getBoundingClientRect();
    const middle = viewport.left + viewport.width / 2;
    let best = null;
    for (const item of document.querySelectorAll(".status-picker-item")) {
      const rect = item.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - middle);
      if (!best || distance < best.distance) best = { distance, status: item.dataset.status };
    }
    return best.distance < 1 ? best.status : null;
  });

async function expectSelected(status) {
  await expect($(`#status-group input[value="${status}"]`)).toBeSelected();
  await expectEventually(centredStatus, status);
}

const arrow = step => $(`.status-picker-arrow[data-step="${step}"]`);

async function neighbour(side) {
  const box = await boundingBox($(".status-picker-viewport"));
  const slot = await browser.execute(() =>
    parseFloat(getComputedStyle(document.querySelector("climbing-status-picker")).getPropertyValue("--status-slot")),
  );
  return { x: Math.round(box.x + box.width / 2 + side * slot), y: Math.round(box.y + box.height / 2) };
}

const clickAt = ({ x, y }) => browser.action("pointer").move({ x, y, origin: "viewport" }).down().up().perform();

describe("status carousel (#1200)", () => {
  beforeEach(async () => {
    await browser.setViewport({ width: 375, height: 812 });
    const owner = await claimOwner();
    await owner.seed(SEED);
    await gotoSyncedLog(owner);
    await $("#add-btn").click();
    await expect($(".status-picker")).toBeDisplayed();
  });

  it("starts on Send, and tapping a neighbour or an arrow selects and centres it, wrapping round", async () => {
    await expectSelected("send");

    await clickAt(await neighbour(1));
    await expectSelected("project");

    await arrow(1).click();
    await expectSelected("checkout");
    await arrow(1).click();
    await expectSelected("archived");
    await arrow(1).click();
    await expectSelected("flash");
    await arrow(-1).click();
    await expectSelected("archived");

    await clickAt(await neighbour(-1));
    await expectSelected("checkout");
  });

  it("tapping an arrow faster than it settles keeps the track full", async () => {
    let taps = browser.action("pointer").move({ origin: await arrow(1) });
    for (let tap = 0; tap < 7; tap++) taps = taps.down().up();
    await taps.perform();
    const visible = await browser.execute(() => {
      const viewport = document.querySelector(".status-picker-viewport").getBoundingClientRect();
      return [...document.querySelectorAll(".status-picker-item")].filter(item => {
        const rect = item.getBoundingClientRect();
        return rect.right > viewport.left && rect.left < viewport.right;
      }).length;
    });
    expect(visible).toBeGreaterThanOrEqual(3);
    await expectSelected("checkout");
  });

  it("a caption wider than its slot, as with a fallback font, keeps the choice centred", async () => {
    await browser.execute(() => {
      const style = document.createElement("style");
      style.textContent = ".status-picker-caption { letter-spacing: .3em; }";
      document.head.append(style);
    });
    await arrow(1).click();
    await expectSelected("project");
  });

  it("dragging one slot left moves to the next status", async () => {
    const viewport = await boundingBox($(".status-picker-viewport"));
    const y = Math.round(viewport.y + viewport.height / 2);
    const start = Math.round(viewport.x + viewport.width * 0.75);
    await browser
      .action("pointer")
      .move({ x: start, y, origin: "viewport" })
      .down()
      .move({ x: Math.round(start - viewport.width / 3), y, origin: "viewport", duration: 200 })
      .pause(200)
      .up()
      .perform();
    await expectSelected("project");
  });

  it("arrow keys on the focused radio move the carousel and show a focus ring on the frame", async () => {
    await browser.execute(() => document.querySelector('#status-group input[value="send"]').focus());
    await browser.keys("ArrowRight");
    await expectSelected("project");
    await browser.keys("ArrowLeft");
    await browser.keys("ArrowLeft");
    await expectSelected("flash");
    await browser.keys("ArrowLeft");
    await expectSelected("archived");
    const outline = await browser.execute(
      () => getComputedStyle(document.querySelector(".status-picker-frame")).outlineStyle,
    );
    expect(outline).toBe("solid");
  });

  it("editing an entry centres its status", async () => {
    await $("#entry-close").click();
    await $("#collapse-all-btn").click();
    await $('//tr[.//*[normalize-space(text())="Carousel Seed"]]//*[contains(@class, "edit-btn")]').click();
    await expectSelected("project");
  });

  it("the form passes axe with the carousel", async () => {
    expect(await axeViolations("#entry-overlay")).toEqual([]);
  });
});

describe("status carousel with reduced motion (#1200)", () => {
  it("moves without animating", async () => {
    // Firefox can't override it over BiDi, so its profile turns reduced motion on for every test (wdio.conf.js).
    if (browser.capabilities.browserName !== "firefox")
      afterThisTest(await browser.emulate("media", { prefersReducedMotion: "reduce" }));
    const owner = await claimOwner();
    await gotoSyncedLog(owner);
    await $("#add-btn").click();
    await arrow(1).click();
    await browser.execute(() => new Promise(requestAnimationFrame));
    await browser.execute(() => new Promise(requestAnimationFrame));
    expect(await centredStatus()).toBe("project");
  });
});
