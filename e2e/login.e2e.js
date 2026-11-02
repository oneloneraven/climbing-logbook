import { $, browser, expect } from "@wdio/globals";
import { DEV_USER, d1Execute } from "../scripts/lib/dev-session.mjs";
import { TERMS_VERSION } from "../shared/terms.js";
import { ownedRouteUrl } from "./owned-route-url.js";
import { clearCookies, recordFetches, waitForUrl } from "./wdio-browser.js";
import { holdRequests } from "./wdio-hold.js";
import { mockTurnstile } from "./wdio-turnstile.js";

const BASE_URL = "http://localhost:8787";

async function logIn(email, password) {
  await $("#email").setValue(email);
  await $("#password").setValue(password);
  await $("#login-submit-btn").click();
}

const postJson = (path, body) =>
  browser.execute(
    (path, body) =>
      fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    path,
    body,
  );

describe("login", () => {
  beforeEach(clearCookies);

  it("logs in via the login page, then logs out again", async () => {
    await browser.url("/login/");

    await logIn(DEV_USER.email, DEV_USER.password);
    await waitForUrl(url => url.pathname === `/${DEV_USER.username}/log`);

    const session = await browser.execute(() => fetch("/-/api/auth/get-session").then(r => r.json()));
    expect(session?.user?.email).toBe(DEV_USER.email);

    // A bare POST with no body silently fails to end the session.
    await postJson("/-/api/auth/sign-out", {});
    const afterSignOut = await browser.execute(() => fetch("/-/api/auth/get-session").then(r => r.json()));
    expect(afterSignOut).toBeNull();
  });

  it("an enrolled user logging in on a non-apex host skips the channel read and lands on /log on the same origin", async () => {
    await browser.url("/login/");
    await postJson("/-/api/auth/sign-in/email", { email: DEV_USER.email, password: DEV_USER.password });
    await browser.execute(() =>
      fetch("/-/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betaOptIn: true }),
      }),
    );
    await postJson("/-/api/auth/sign-out", {});

    await browser.url("/login/");
    const settingsReadsFromLogin = await browser.mock("**/-/api/settings", {
      method: "GET",
      requestHeaders: headers => new URL(headers.referer ?? headers.Referer ?? BASE_URL).pathname === "/login/",
    });
    const origin = new URL(await browser.getUrl()).origin;
    await logIn(DEV_USER.email, DEV_USER.password);
    await waitForUrl(url => url.href === `${origin}/${DEV_USER.username}/log`);
    expect(settingsReadsFromLogin.calls).toEqual([]);
  });

  it("shows an inline error for the wrong password, without navigating away", async () => {
    await browser.url("/login/");

    await logIn(DEV_USER.email, "definitely-the-wrong-password");

    await expect($("#login-error")).toBeDisplayed();
    await expect(browser).toHaveUrl(expect.stringMatching(/\/login\/?$/));
    await expect($("#login-error")).toBeFocused();
  });

  it("forgot password checks for a bot, then asks for the reset email (#1053)", async () => {
    await mockTurnstile();
    const fetches = await recordFetches();
    await browser.url("/login/");
    await $("#email").setValue("someone@example.com");

    const reset = fetches.next("/-/api/auth/request-password-reset", "POST");
    await $("#forgot-password-btn").click();

    expect(JSON.parse((await reset).body)).toMatchObject({
      email: "someone@example.com",
      turnstileToken: "e2e-stub-token",
    });
    await expect($("#login-info")).toBeDisplayed();
  });

  it("an unverified account is offered the verification email again (#1335)", async () => {
    const code = `e2e-unverified-${Date.now()}`;
    const email = `e2e-unverified-${Date.now()}@example.com`;
    d1Execute(`INSERT OR IGNORE INTO beta_invites (code) VALUES ('${code}')`, {
      database: "climbing-logbook-preview",
      env: "preview",
    });
    const signUp = await fetch(`${BASE_URL}/-/api/auth/sign-up/email`, {
      method: "POST",
      headers: { Origin: BASE_URL, "content-type": "application/json" },
      body: JSON.stringify({
        email,
        username: `e2eunverified${Date.now()}`,
        name: "unverified",
        password: "correct-horse-battery-staple",
        code,
        turnstileToken: "e2e-stub-token",
        agreedTermsVersion: TERMS_VERSION,
      }),
    });
    expect({ ok: signUp.ok, body: signUp.ok ? "" : await signUp.text() }).toEqual({ ok: true, body: "" });

    await mockTurnstile();
    const fetches = await recordFetches();
    await browser.url("/login/");
    await logIn(email, "correct-horse-battery-staple");

    await expect($("#login-error")).toHaveTextContent(expect.stringMatching(/Verify your email address first/));
    await expect($("#resend-verification-btn")).toBeDisplayed();

    const resend = fetches.next("/-/api/auth/send-verification-email", "POST");
    await $("#resend-verification-btn").click();

    expect(JSON.parse((await resend).body)).toMatchObject({ email, turnstileToken: "e2e-stub-token" });
    await expect($("#login-info")).toHaveTextContent(expect.stringMatching(/sent a new link/));
    await expect($("#resend-verification-btn")).not.toBeDisplayed();
  });

  it("a wrong password doesn't offer the verification email", async () => {
    await browser.url("/login/");
    await logIn(DEV_USER.email, "definitely-the-wrong-password");

    await expect($("#login-error")).toBeDisplayed();
    await expect($("#resend-verification-btn")).not.toBeDisplayed();
  });

  it("forgot password requires an email first", async () => {
    await browser.url("/login/");

    await $("#forgot-password-btn").click();

    await expect($("#login-error")).toBeDisplayed();
    await expect($("#login-info")).not.toBeDisplayed();
    await expect($("#email")).toBeFocused();
  });

  it("an owner page with no session logs in on its own origin and comes back to the same page", async () => {
    const mapUrl = ownedRouteUrl(DEV_USER.username, "/view/map");
    await browser.url(mapUrl);
    await waitForUrl(url => url.pathname === "/-/login/");
    const loginUrl = new URL(await browser.getUrl());
    expect(loginUrl.host).toBe(new URL(mapUrl).host);
    expect(loginUrl.searchParams.get("returnTo")).toBe(`/${DEV_USER.username}/view/map`);

    await logIn(DEV_USER.email, DEV_USER.password);

    await waitForUrl(url => url.href === mapUrl);
    await expect($("climbing-tab-bar")).toExist();
  });

  it("shows the login form after a few seconds even when the session check hangs", async () => {
    await holdRequests("/-/api/auth/get-session");
    await browser.url("/login/");

    await expect($("#page-content")).not.toBeDisplayed();
    await expect($("#email")).toBeDisplayed({ wait: 4000 });
  });
});
