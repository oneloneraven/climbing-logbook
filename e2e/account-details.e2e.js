import { $, browser, expect } from "@wdio/globals";
import { recordFetches } from "./wdio-browser.js";
import { claimOwner } from "./wdio-owner.js";

// The rows are in the static page, so wait for the script to fill them in before using their buttons.
async function openAuthentication(owner) {
  await browser.url(owner.url("/account/authentication"));
  await expect($("#email-value")).toHaveTextContent(owner.email);
}

describe("account details", () => {
  it("shows the current username/email, and each row is independently editable", async () => {
    const owner = await claimOwner();
    await openAuthentication(owner);

    await expect($("#username-value")).toHaveTextContent(owner.username);
    await expect($("#email-value")).toHaveTextContent(owner.email);
    await expect($("#back-to-account-link")).toHaveAttribute("href", `/${owner.username}/account`);

    await $("#email-edit-btn").click();
    await expect($("#email-form")).toBeDisplayed();
    await expect($("#username-form")).not.toBeDisplayed();
    await expect($("#password-form")).not.toBeDisplayed();

    await $("#email-cancel-btn").click();
    await expect($("#email-form")).not.toBeDisplayed();
    await expect($("#email-view")).toBeDisplayed();
  });

  it("username row: saving posts only { username }, and the server takes the new name", async () => {
    const owner = await claimOwner();
    const fetches = await recordFetches();
    await openAuthentication(owner);
    const newName = `${owner.username}x`;

    await $("#username-edit-btn").click();
    await $("#username-input").setValue(newName);
    const updated = fetches.next("/-/api/auth/update-user", "POST");
    await $("#username-save-btn").click();

    const update = await updated;
    expect(JSON.parse(update.body)).toEqual({ username: newName });
    expect(update.status).toBe(200);
  });

  it("email row: saving shows the pending-confirmation state, doesn't change the displayed email yet", async () => {
    const owner = await claimOwner();
    await openAuthentication(owner);
    const newEmail = `${owner.username}-new@climbinglogbook.local`;

    await $("#email-edit-btn").click();
    await $("#email-input").setValue(newEmail);
    await $("#email-save-btn").click();

    await expect($("#email-pending")).toBeDisplayed();
    await expect($("#email-pending")).toHaveTextContent(expect.stringContaining(newEmail));
    await expect($("#email-value")).toHaveTextContent(owner.email);
    await expect($("#email-form")).not.toBeDisplayed();
  });

  it("password row: saving succeeds and closes the form, without touching username/email", async () => {
    const owner = await claimOwner();
    await openAuthentication(owner);

    await $("#password-edit-btn").click();
    await $("#current-password-input").setValue(owner.password);
    await $("#new-password-input").setValue("new-password-456");
    await $("#password-save-btn").click();

    await expect($("#password-form")).not.toBeDisplayed();
    await expect($("#password-view")).toBeDisplayed();
    await expect($("#username-value")).toHaveTextContent(owner.username);
    await expect($("#email-value")).toHaveTextContent(owner.email);
  });

  it("shows the server's own error message and keeps the form open on failure", async () => {
    const owner = await claimOwner();
    await openAuthentication(owner);

    await $("#password-edit-btn").click();
    await $("#current-password-input").setValue("wrong-password");
    await $("#new-password-input").setValue("new-password-456");
    await $("#password-save-btn").click();

    await expect($("#password-error")).toHaveTextContent("Invalid password");
    await expect($("#password-form")).toBeDisplayed();
  });

  it("each section's password form opens on its own (#1457)", async () => {
    const owner = await claimOwner();
    await openAuthentication(owner);
    await expect($("#two-step-off")).toBeDisplayed();

    await $("#password-edit-btn").click();
    await expect($("#password-form")).toBeDisplayed();
    await expect($("#two-step-password-form")).not.toBeDisplayed();
    await $("#password-cancel-btn").click();

    await $("#setup-start-btn").click();
    await expect($("#two-step-password-form")).toBeDisplayed();
    await expect($("#password-form")).not.toBeDisplayed();
    await $("#two-step-password-cancel-btn").click();
    await expect($("#two-step-off")).toBeDisplayed();
    await expect($("#password-view")).toBeDisplayed();
  });
});
