import { $$, browser, expect } from "@wdio/globals";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { ownedRouteUrl } from "./owned-route-url.js";
import { signInDevUser } from "./wdio-owner.js";

const recordWhenContentShows = () =>
  browser.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.querySelector(".place-header[data-location-id]")?.checkVisibility()) return;
      localStorage.setItem("e2eContentShownAt", String(Date.now()));
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true, attributes: true });
  });

describe("log page boot", () => {
  // The real route, Worker and seeded D1, not mocks: this measures what ships.
  it("log page renders real content within a generous local budget, no artificial throttling", async () => {
    await signInDevUser("my.localhost");
    await recordWhenContentShows();

    const start = Date.now();
    await browser.url(ownedRouteUrl(DEV_USER.username, "/log"));
    await expect($$(".place-header[data-location-id]")[0]).toBeDisplayed();
    // Timed by the page, as WebDriver's own first commands can add most of a second.
    const shownAt = await browser.execute(() => localStorage.getItem("e2eContentShownAt"));
    expect(shownAt).not.toBeNull();
    const elapsedMs = Number(shownAt) - start;

    // About 2.5x the measured 525-612ms.
    expect(elapsedMs).toBeLessThan(1500);
  });
});
