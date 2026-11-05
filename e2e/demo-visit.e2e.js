import { $, $$, browser, expect } from "@wdio/globals";
import { settle, waitForPath, waitForUrl } from "./wdio-browser.js";
import { recordPageEvents } from "./wdio-hooks.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

const tour = () => $('[role="dialog"][aria-labelledby="tour-title"]');
const waitForUrlEnding = ending => waitForUrl(url => url.href.endsWith(ending), ending);

describe("a visitor with nothing stored", () => {
  it("the home page's demo links start the tour, and the visit stores nothing", async () => {
    await recordPageEvents();
    await browser.url("/");
    await $("#demo-picker-wrap").$('role/button[name="View a demo first"]').click();
    const link = $("a*=Intermediate");
    await expect(link).toHaveAttribute("href", "/intermediatedemo/log?tour=1&returnTo=%2Fintermediatedemo%2Flog");

    await browser.url(`http://my.localhost:8787${await link.getAttribute("href")}`);
    await expect(tour()).toHaveTextContent(expect.stringContaining("1 of 11"));
    await tour().$('role/button[name="Skip tour"]').click();
    await waitForUrlEnding("/intermediatedemo/log");
    await expect($$(".place-header[data-location-id]")[0]).toBeDisplayed();

    await browser.url("http://my.localhost:8787/intermediatedemo/view/map");
    await expect($("#map-svg")).toBeDisplayed();
    await expect(tour()).not.toExist();
    await settle();
    expect(await browser.execute(() => Object.keys(localStorage))).toEqual([]);
  });

  it("the demo's menu has Take the tour, which returns to the page it started from", async () => {
    await browser.url("http://my.localhost:8787/beginnerdemo/view/map");
    await $("#header-menu-btn").click();
    const link = $("#header-menu-popover").$('role/link[name="Take the tour"]');
    await expect(link).toBeDisplayed();
    await expect($("#header-menu-bottom-row")).toHaveElementClass("border-t");

    await link.click();
    await waitForUrlEnding("/beginnerdemo/log?tour=1&returnTo=%2Fbeginnerdemo%2Fview%2Fmap");
    await tour().$('role/button[name="Skip tour"]').click();
    await waitForPath("/beginnerdemo/view/map");
  });
});

describe("your own logbook", () => {
  it("your own logbook's menu has no Take the tour", async () => {
    const owner = await claimOwner();
    await gotoSyncedLog(owner);
    await $("#header-menu-btn").click();
    await expect($("#my-account-link")).toBeDisplayed();
    await expect($("#demo-tour-link")).not.toBeDisplayed();
  });
});
