import { $$, browser, expect } from "@wdio/globals";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { ownedRouteUrl } from "./owned-route-url.js";
import { signInDevUser } from "./wdio-owner.js";

describe("log page boot", () => {
  // The real route, Worker and seeded D1, not mocks: this measures what ships.
  it("log page renders real content within a generous local budget, no artificial throttling", async () => {
    await signInDevUser("my.localhost");

    const start = Date.now();
    await browser.url(ownedRouteUrl(DEV_USER.username, "/log"));
    await expect($$(".place-header[data-location-id]")[0]).toBeDisplayed();
    const elapsedMs = Date.now() - start;

    // About 2.5x the measured 525-612ms.
    expect(elapsedMs).toBeLessThan(1500);
  });
});
