import { $, browser, expect } from "@wdio/globals";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { ownedRouteUrl } from "./owned-route-url.js";
import { waitForPath, waitForUrl } from "./wdio-browser.js";
import { signInDevUser } from "./wdio-owner.js";

const LAUNCH = "http://my.localhost:8787/-/launch/";

describe("launch", () => {
  it("the manifest names no user and starts at /-/launch/", async () => {
    await browser.url("http://my.localhost:8787/login/");
    const manifest = await browser.execute(() => fetch("/-/manifest.json").then(r => r.json()));
    expect(manifest.start_url).toBe("/-/launch/");
    expect(manifest.id).toBe("/");
    expect(JSON.stringify(manifest)).not.toContain(DEV_USER.username);
    expect(JSON.stringify(manifest).toLowerCase()).not.toContain("ravendarque");
  });

  it("opening the app lands the signed-in user on their own logbook", async () => {
    await signInDevUser("my.localhost");
    await browser.url(ownedRouteUrl(DEV_USER.username, "/view/map"));
    await browser.waitUntil(
      async () =>
        (await browser.execute(() => localStorage.getItem("logbook_signed_in_user"))) ===
        DEV_USER.username.toLowerCase(),
    );

    await browser.url(LAUNCH);
    await waitForUrl(url => url.href === ownedRouteUrl(DEV_USER.username, "/log"));
    await expect($("climbing-entries-table")).toBeDisplayed();
  });

  describe("nobody signed in on this device", () => {
    beforeEach(() => browser.deleteCookies());

    it("opening the app goes to this origin's login", async () => {
      await browser.url(LAUNCH);
      await waitForPath("/-/login/");
      expect(new URL(await browser.getUrl()).host).toBe("my.localhost:8787");
    });
  });
});
