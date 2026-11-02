import { $, browser, expect } from "@wdio/globals";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { waitForPath } from "./wdio-browser.js";

describe("logged in", () => {
  it("redirects away from the apex marketing page to /log", async () => {
    await browser.url("/");
    await waitForPath(`/${DEV_USER.username}/log`);
  });

  it("redirects away from /login/ to /log", async () => {
    await browser.url("/login/");
    await waitForPath(`/${DEV_USER.username}/log`);
  });
});

describe("logged out", () => {
  beforeEach(() => browser.deleteCookies());

  it("shows the apex marketing page normally", async () => {
    await browser.url("/");
    await expect($("climbing-header [data-brand-name]")).toBeDisplayed();
    await expect($("a*=Sign up")).toBeDisplayed();
    await expect($("a*=Log in")).toBeDisplayed();
    await expect(browser).toHaveUrl(expect.stringMatching(/\/$/));
  });

  it("shows the login form normally", async () => {
    await browser.url("/login/");
    await expect($("#login-form")).toBeDisplayed();
    await expect(browser).toHaveUrl(expect.stringMatching(/\/login\/?$/));
  });
});
