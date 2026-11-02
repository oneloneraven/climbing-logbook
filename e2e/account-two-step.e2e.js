import { $, $$, browser, expect } from "@wdio/globals";
import { totp } from "../test/totp.js";
import { clearCookies, waitForPath } from "./wdio-browser.js";
import { claimOwner } from "./wdio-owner.js";

async function turnOnInPage(owner) {
  await browser.url(owner.url("/account/authentication"));
  await expect($("#two-step-off")).toBeDisplayed();
  await $("#setup-start-btn").click();
  await $("#two-step-password").setValue(owner.password);
  await $("#two-step-password-submit-btn").click();
  await expect($("#qr-code svg")).toBeDisplayed();
  const secret = (await $("#setup-key").getText()).trim();
  await $("#setup-code").setValue(await totp(secret));
  await $("#setup-verify-btn").click();
  await expect($$("#backup-codes-list li")).toBeElementsArrayOfSize(10);
  const backupCodes = await $$("#backup-codes-list li").map(code => code.getText());
  await $("#codes-done-btn").click();
  await expect($("#two-step-on")).toBeDisplayed();
  return { secret, backupCodes };
}

async function logInWithPassword(owner) {
  await clearCookies();
  await browser.url("/login/");
  await $("#email").setValue(owner.email);
  await $("#password").setValue(owner.password);
  await $("#login-submit-btn").click();
  await expect($("#code-form")).toBeDisplayed();
}

describe("two-step verification", () => {
  it("sets up 2FA from My Account, then logging in asks for a code (#1436)", async () => {
    const owner = await claimOwner();
    const { secret } = await turnOnInPage(owner);

    await logInWithPassword(owner);
    await $("#code").setValue(await totp(secret));
    await $("#code-submit-btn").click();
    await waitForPath(`/${owner.username}/log`);
  });

  it("logs in with a backup code, and refuses a wrong code (#1436)", async () => {
    const owner = await claimOwner();
    const { backupCodes } = await turnOnInPage(owner);
    await logInWithPassword(owner);

    await $("#code").setValue("000000");
    await $("#code-submit-btn").click();
    await expect($("#code-error")).toHaveTextContent(
      "That code didn't work. Check your authenticator app and try again.",
    );

    await $("#use-backup-code-btn").click();
    await $("#code").setValue(backupCodes[0]);
    await $("#code-submit-btn").click();
    await waitForPath(`/${owner.username}/log`);
  });

  it("explains the 7-day wait before emailing a recovery link (#1436)", async () => {
    const owner = await claimOwner();
    await turnOnInPage(owner);
    await logInWithPassword(owner);
    await $("#lost-device-btn").click();
    await expect($("#lost-device")).toHaveTextContent(expect.stringContaining("7 days"));
    await expect($("#lost-device")).toHaveTextContent(expect.stringContaining("We can't switch it off for you"));
    await $("#recovery-btn").click();
    await expect($("#code-info")).toHaveTextContent("We've emailed you a link. It works for 24 hours.");
  });

  it("turns 2FA off with the password (#1436)", async () => {
    const owner = await claimOwner();
    await turnOnInPage(owner);
    await $("#turn-off-btn").click();
    await $("#two-step-password").setValue(owner.password);
    await $("#two-step-password-submit-btn").click();
    await expect($("#two-step-off")).toBeDisplayed();

    await clearCookies();
    await browser.url("/login/");
    await $("#email").setValue(owner.email);
    await $("#password").setValue(owner.password);
    await $("#login-submit-btn").click();
    await waitForPath(`/${owner.username}/log`);
  });
});
