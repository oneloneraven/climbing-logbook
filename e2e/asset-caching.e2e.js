import { $$, browser, expect } from "@wdio/globals";
import { ownedRouteUrl } from "./owned-route-url.js";
import { signInDevUser } from "./wdio-owner.js";

describe("asset caching", () => {
  // transferSize 0, not CDP's fromDiskCache, which is wrong under network emulation.
  it("stable-named entry files serve from disk cache, not network, on a repeat visit", async () => {
    await signInDevUser("my.localhost");

    await browser.url(ownedRouteUrl("devuser", "/log"));
    await expect($$(".place-header[data-location-id]")[0]).toBeDisplayed();

    await browser.url(ownedRouteUrl("devuser", "/log"));
    await expect($$(".place-header[data-location-id]")[0]).toBeDisplayed();

    const transferSizes = await browser.execute(() => {
      const resources = performance.getEntriesByType("resource");
      const find = substring => resources.find(e => e.name.includes(substring))?.transferSize;
      return {
        tailwindCss: find("/-/tailwind.css"),
        logApp: find("/-/log-app.js"),
        climbingHeader: find("/-/components/climbing-header.js"),
        aChunk: find("/-/chunks/"),
      };
    });

    expect(transferSizes.tailwindCss).toBe(0);
    expect(transferSizes.logApp).toBe(0);
    expect(transferSizes.climbingHeader).toBe(0);
    expect(transferSizes.aChunk).toBe(0);
  });

  it("the root /service-worker.js is served as JavaScript with the platform default cache header", async () => {
    const res = await fetch("http://localhost:8787/service-worker.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^(text|application)\/javascript/);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(await res.text()).toMatch(/LOGBOOK_BUILD/);
  });
});
