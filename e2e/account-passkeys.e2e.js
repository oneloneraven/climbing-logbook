import { $, browser, expect } from "@wdio/globals";
import { OWNED_ORIGIN } from "./owned-route-url.js";
import { browserFetch, clearCookies, recordNavigations } from "./wdio-browser.js";
import { claimOwner } from "./wdio-owner.js";

// The virtual authenticator answers an autofill request by itself, which a person never would; off unless a test wants it.
const withoutAutofill = () =>
  browser.addInitScript(() => {
    PublicKeyCredential.isConditionalMediationAvailable = async () => false;
  });

describe("account passkeys", () => {
  it("a session over a day old is asked to log in again before adding a passkey (#1439)", async () => {
    const owner = await claimOwner();
    const body = await (await browserFetch(`${OWNED_ORIGIN}/-/api/auth/get-session`)).json();
    body.session.createdAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const session = await browser.mock("**/-/api/auth/get-session");
    session.respond(body, { fetchResponse: false });

    await browser.url(owner.url("/account/authentication"));
    await expect($("#passkeys-reauth")).not.toBeDisplayed();
    await $("#add-passkey-start-btn").click();
    await expect($("#passkeys-reauth")).toBeDisplayed();
    await expect($("#add-passkey-form")).not.toBeDisplayed();
    const navigations = await recordNavigations();
    await $("#passkeys-reauth-btn").click();
    await browser.waitUntil(
      () =>
        navigations.some(
          url =>
            url.pathname === "/-/login/" &&
            url.searchParams.get("returnTo") === `/${owner.username}/account/authentication`,
        ),
      { timeoutMsg: "never went to log in again" },
    );
  });

  it("if the server says the session isn't fresh, the page asks to log in again (#1439)", async () => {
    const owner = await claimOwner();
    await withoutAutofill();
    const options = await browser.mock("**/-/api/auth/passkey/generate-register-options*");
    options.respond(
      { code: "SESSION_NOT_FRESH", message: "Session is not fresh" },
      {
        statusCode: 403,
        fetchResponse: false,
      },
    );
    await browser.url(owner.url("/account/authentication"));
    await $("#add-passkey-start-btn").click();
    await $("#passkey-name").setValue("Phone");
    await $("#add-passkey-btn").click();
    await expect($("#passkeys-reauth")).toBeDisplayed();
    await expect($("#passkeys-error")).not.toBeDisplayed();
  });

  it("cancelling the passkey prompt explains what to do, rather than saying nothing (#1439)", async () => {
    await withoutAutofill();
    await browser.addInitScript(() => {
      navigator.credentials.get = async () => {
        throw new DOMException("The operation either timed out or was not allowed.", "NotAllowedError");
      };
    });
    await clearCookies();
    await browser.url(`${OWNED_ORIGIN}/-/login/`);
    await $("#passkey-login-btn").click();
    await expect($("#login-info")).toHaveTextContent(
      "No passkey was used. If you haven't added one for Climbing Logbook yet, log in with your password, then add one in My Account.",
    );
    await expect($("#login-error")).not.toBeDisplayed();
  });

  describe("on Firefox for Android", () => {
    beforeEach(async () => {
      await browser.emulate("userAgent", "Mozilla/5.0 (Android 15; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0");
    });

    it("the Add a passkey card opens from a neutral button, prefilled with this browser and device, and Cancel closes it (#1467)", async () => {
      const owner = await claimOwner();
      await browser.url(owner.url("/account/authentication"));
      const start = $("#add-passkey-start-btn");
      await expect(start).toBeDisplayed();
      await expect(start).not.toHaveElementClass("btn-primary");
      await expect($("#add-passkey-form")).not.toBeDisplayed();

      await start.click();
      await expect($("#add-passkey-form")).toBeDisplayed();
      await expect($("#passkey-name")).toHaveValue("Firefox on Android");
      await expect($("#passkey-name")).not.toHaveAttribute("placeholder");

      await $("#add-passkey-cancel-btn").click();
      await expect($("#add-passkey-form")).not.toBeDisplayed();
      await expect(start).toBeDisplayed();
    });
  });
});
