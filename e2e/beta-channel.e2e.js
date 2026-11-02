import { $, browser, expect } from "@wdio/globals";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { browserFetch, expectEventually, resourceUrls, settle, textContents, waitForUrl } from "./wdio-browser.js";
import { signInDevUser } from "./wdio-owner.js";

const BETA = "http://beta.localhost:8787";

async function setEnrollment(enrolled) {
  const res = await browserFetch("http://localhost:8787/-/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ betaOptIn: enrolled }),
  });
  expect(res.ok).toBe(true);
}

describe("beta channel enrollment check", () => {
  beforeEach(() => signInDevUser("beta.localhost"));
  afterEach(() => setEnrollment(false));

  it("a not-enrolled user sees the message, keeps the header, and the page never loads its data", async () => {
    await setEnrollment(false);

    await browser.url(`${BETA}/${DEV_USER.username}/log`);
    const message = $("#beta-not-enrolled");
    await expect(message).toBeDisplayed();
    await expect(message).toHaveTextContent(expect.stringContaining("Check our beta is for enrolled users"));
    await expect(message.$("a*=Join Check our beta")).toHaveAttribute("href", `/${DEV_USER.username}/account/beta`);
    await expect($("climbing-page-header")).toBeDisplayed();
    await expect($("climbing-entries-table")).not.toBeDisplayed();
    await expectEventually(() => textContents("h1", { visibleOnly: true }), ["Check our beta is for enrolled users"]);
    expect((await resourceUrls()).filter(url => /\/-\/api\/(logbook|places|locations)\b/.test(url))).toEqual([]);
  });

  it("an enrolled user's page boots normally", async () => {
    await setEnrollment(true);
    await browser.url(`${BETA}/${DEV_USER.username}/log`);
    await expect($("climbing-entries-table")).toBeDisplayed();
    await expect($("#beta-not-enrolled")).not.toExist();
  });

  it("leaving the beta elsewhere is picked up: the cached 'enrolled' is corrected and the page reloads to the message", async () => {
    await setEnrollment(true);
    const map = `/${DEV_USER.username}/view/map`;
    await browser.url(`${BETA}/${DEV_USER.username}/sync?returnTo=${encodeURIComponent(map)}`);
    await waitForUrl(url => url.href === `${BETA}${map}`);
    await settle();
    await expect($("#beta-not-enrolled")).not.toExist();

    await setEnrollment(false);
    await browser.url(`${BETA}/${DEV_USER.username}/view/map`);
    await expect($("#beta-not-enrolled")).toBeDisplayed();
  });
});

describe("Logbook Beta's identity", () => {
  it("beta pages carry the Beta badge, yellow theme colour and Logbook Beta's manifest", async () => {
    await signInDevUser("beta.localhost");
    await browser.url(`${BETA}/${DEV_USER.username}/log`);
    await expect($("#brand-lockup use")).toHaveAttribute("href", expect.stringMatching(/#lockup-beta$/));
    await expect($("climbing-header [data-brand-name]")).toHaveTextContent("Climbing Logbook Beta");
    await expect($('meta[name="theme-color"]')).toHaveAttribute("content", "#ffcc00");
    const manifest = await browser.execute(async () => (await fetch("/-/manifest.json")).json());
    expect(manifest.short_name).toBe("Logbook Beta");
  });

  it("the main app has none of it", async () => {
    await signInDevUser("my.localhost");
    await browser.url(`http://my.localhost:8787/${DEV_USER.username}/account`);
    await expect($("climbing-header [data-brand-name]")).toHaveTextContent("Climbing Logbook");
    await expect($("#brand-lockup use")).toHaveAttribute("href", expect.stringMatching(/#lockup$/));
    await expect($('meta[name="theme-color"]')).toHaveAttribute("content", "#ff2727");
    const manifest = await browser.execute(async () => (await fetch("/-/manifest.json")).json());
    expect(manifest.short_name).toBe("Logbook");
  });
});
