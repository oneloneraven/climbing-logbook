import { $, browser, expect } from "@wdio/globals";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { ownedRouteUrl } from "./owned-route-url.js";
import { settle } from "./wdio-browser.js";
import { signInDevUser } from "./wdio-owner.js";

const APEX_PATH = /^\/($|help(\/|$)|login(\/|$)|register(\/|$)|reset-password(\/|$))/;

async function unmarkedApexLinks() {
  await settle();
  return browser.execute(source => {
    const apexPath = new RegExp(source);
    return [...document.querySelectorAll("a[href]")]
      .filter(link => new URL(link.href).origin === location.origin && apexPath.test(new URL(link.href).pathname))
      .filter(link => !link.hasAttribute("data-apex-link"))
      .map(link => link.outerHTML);
  }, APEX_PATH.source);
}

describe("apex links", () => {
  beforeEach(() => signInDevUser("my.localhost"));

  for (const path of ["/log", "/view", "/view/map", "/performance", "/performance/pyramid", "/account", "/sync"]) {
    it(`${path}: every link to an apex page is marked for the apex`, async () => {
      await browser.url(ownedRouteUrl(DEV_USER.username, path));
      await expect($("footer")).toExist();
      expect(await unmarkedApexLinks()).toEqual([]);
    });
  }

  it("the public profile: every link to an apex page is marked for the apex", async () => {
    await browser.url(ownedRouteUrl(DEV_USER.username, ""));
    await expect($("footer")).toExist();
    expect(await unmarkedApexLinks()).toEqual([]);
  });
});
