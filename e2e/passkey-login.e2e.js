import { $, $$, browser, expect } from "@wdio/globals";
import { OWNED_ORIGIN } from "./owned-route-url.js";
import { clearCookies, expectEventually, textContents, waitForPath } from "./wdio-browser.js";
import { claimOwner } from "./wdio-owner.js";
import { totp } from "../test/totp.js";

const virtualAuthenticator = () => browser.addVirtualAuthenticator("ctap2", "internal", true, true, true, true);

async function addPasskey(owner, name = "Test laptop") {
  await browser.url(owner.url("/account/authentication"));
  await expect($("#passkeys-empty")).toBeDisplayed();
  await $("#add-passkey-start-btn").click();
  await expect($("#passkey-name")).toHaveValue(expect.stringContaining(" on "));
  await $("#passkey-name").setValue(name);
  await $("#add-passkey-btn").click();
  await expect($("#add-passkey-form")).not.toBeDisplayed();
  await expect($("#add-passkey-start-btn")).toBeDisplayed();
  await expect($$("#passkeys-list li")).toBeElementsArrayOfSize(1);
  await expect($("#passkeys-list li")).toHaveText(expect.stringContaining(name));
}

// The virtual authenticator answers an autofill request by itself, which a person never would; off unless a test wants it.
const withoutAutofill = () =>
  browser.addInitScript(() => {
    PublicKeyCredential.isConditionalMediationAvailable = async () => false;
  });

async function logInWithPasskey(owner) {
  await clearCookies();
  await browser.url(`${OWNED_ORIGIN}/-/login/`);
  await expect($("#passkey-login-btn")).toBeDisplayed();
  await $("#passkey-login-btn").click();
  await waitForPath(`/${owner.username}/log`);
}

// Firefox's virtual authenticator waits for a pick from its own autofill list, which WebDriver can't reach.
const chromeOnly = browser.capabilities.browserName === "chrome" ? it : it.skip;

describe("logging in with a passkey", () => {
  it("adds a passkey from My Account, then logs in with it (#1439)", async () => {
    await withoutAutofill();
    await virtualAuthenticator();
    const owner = await claimOwner();
    await addPasskey(owner);
    await logInWithPasskey(owner);
  });

  it("a passkey logs in without asking for a 2FA code (#1439)", async () => {
    await withoutAutofill();
    await virtualAuthenticator();
    const owner = await claimOwner();
    await browser.url(owner.url("/account/authentication"));
    await $("#setup-start-btn").click();
    await $("#two-step-password").setValue(owner.password);
    await $("#two-step-password-submit-btn").click();
    await expect($("#qr-code svg")).toBeDisplayed();
    const secret = (await $("#setup-key").getText()).trim();
    await $("#setup-code").setValue(await totp(secret));
    await $("#setup-verify-btn").click();
    await expect($$("#backup-codes-list li")).toBeElementsArrayOfSize(10);
    await $("#codes-done-btn").click();

    await addPasskey(owner);
    await logInWithPasskey(owner);
  });

  it("renames and removes a passkey, after which it can't log in (#1439)", async () => {
    await withoutAutofill();
    await virtualAuthenticator();
    const owner = await claimOwner();
    await addPasskey(owner, "Old name");
    const item = $("#passkeys-list li");
    await item.$("button=Rename").click();
    await item.$('[aria-label="New name"]').setValue("New name");
    await item.$("button=Save").click();
    // Saving re-renders the list, and an element already found would be the old one.
    await expectEventually(() => textContents("#passkeys-list .row-card-title"), ["New name"]);

    await $("#passkeys-list li").$("button=Remove").click();
    await expect($("#passkeys-empty")).toBeDisplayed();
    await expect($("#passkeys-info")).toHaveText(expect.stringContaining("can't be used to log in any more"));

    await clearCookies();
    await browser.url(`${OWNED_ORIGIN}/-/login/`);
    await $("#passkey-login-btn").click();
    await expect($("#login-error")).toBeDisplayed();
    expect(await browser.getUrl()).toContain("/login/");
  });

  chromeOnly("offers the passkey as autofill on the email field (#1439)", async () => {
    await virtualAuthenticator();
    const owner = await claimOwner();
    await addPasskey(owner);
    await clearCookies();
    await browser.url(`${OWNED_ORIGIN}/-/login/`);
    await expect($("#email")).toHaveAttribute("autocomplete", "email webauthn");
    await waitForPath(`/${owner.username}/log`);
  });
});
