import { $, browser, expect } from "@wdio/globals";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { OWNED_ORIGIN, ownedRouteUrl } from "./owned-route-url.js";
import {
  browserFetch,
  waitForUrl,
  expectEventually,
  recordFetches,
  textContents,
  waitForPath,
} from "./wdio-browser.js";
import { claimOwner } from "./wdio-owner.js";

async function toggleAndWaitForSave(fetches, toggle) {
  const saved = fetches.next("/-/api/settings", "PATCH");
  await toggle.click();
  await saved;
}

describe("account page", () => {
  it("renders the shared chrome, no discipline picker, and the My Account link/username", async () => {
    const owner = await claimOwner();
    await browser.url(owner.url("/account"));

    await expect($("climbing-header [data-brand-name]")).toHaveTextContent("Climbing Logbook");

    await expect($("#discipline-btn")).not.toExist();

    await $("#header-menu-btn").click();
    await expect($("#menu-username")).toHaveTextContent(owner.username);
    await expect($("#my-account-link")).toHaveAttribute("href", `/${owner.username}/account`);

    await expect($("#authentication-link")).toHaveAttribute("href", `/${owner.username}/account/authentication`);
    await expect($("#import-export-link")).toHaveAttribute("href", `/${owner.username}/account/import-export`);
    await expect($("#back-to-logbook-link")).toHaveAttribute("href", `/${owner.username}/log`);
  });

  it("logged out, the page sends you to log in rather than showing an empty account", async () => {
    await browser.url(ownedRouteUrl(DEV_USER.username, "/account"));

    await waitForUrl(url => url.pathname.includes("login"));
  });

  it("Athlete Mode toggle (#445) switches and persists via the settings PATCH", async () => {
    const owner = await claimOwner();
    const fetches = await recordFetches();
    await browser.url(owner.url("/account"));

    const athleteToggle = $("#athlete-mode-toggle");
    await expect($("#athlete-mode-row")).toBeDisplayed();
    await expect(athleteToggle).toHaveAttribute("aria-checked", "false");

    await toggleAndWaitForSave(fetches, athleteToggle);
    await expect(athleteToggle).toHaveAttribute("aria-checked", "true");

    await browser.refresh();
    await expect($("#athlete-mode-toggle")).toHaveAttribute("aria-checked", "true");
  });

  it("Public Logbook toggle (#301, moved to this page by #445) switches and persists via the settings PATCH", async () => {
    const owner = await claimOwner();
    const fetches = await recordFetches();
    await browser.url(owner.url("/account"));

    const publicToggle = $("#public-logbook-toggle");
    await expect($("#public-logbook-row")).toBeDisplayed();
    await expect(publicToggle).toHaveAttribute("aria-checked", "true");

    await toggleAndWaitForSave(fetches, publicToggle);
    await expect(publicToggle).toHaveAttribute("aria-checked", "false");

    await browser.refresh();
    await expect($("#public-logbook-toggle")).toHaveAttribute("aria-checked", "false");
  });

  it("the Check our beta row links to its sub-page and shows the saved status", async () => {
    const owner = await claimOwner();
    await owner.settings({ betaOptIn: true });
    await browser.url(owner.url("/account"));

    const row = $("#beta-row");
    await expect(row).toBeDisplayed();
    await expect(row).toHaveAttribute("href", `/${owner.username}/account/beta`);
    await expect($("#beta-status")).toHaveTextContent("You're enrolled in Check our beta.");
  });

  it("groups the hub into Account and Settings, then Data and the Danger zone (#1457)", async () => {
    const owner = await claimOwner();
    await browser.url(owner.url("/account"));

    await expectEventually(() => textContents("#account-sections > div:nth-of-type(1) h2"), ["Account", "Settings"]);
    await expectEventually(() => textContents("#account-sections > div:nth-of-type(2) h2"), ["Data", "Danger zone"]);
    await expectEventually(
      () => textContents("#account-options .row-card-title"),
      ["Account and authentication", "Take the tour"],
    );
    await expectEventually(
      () => textContents("#account-data .row-card-title"),
      ["Manage places", "Import and export entries", "Health data", "Clear my data from this device"],
    );
  });

  it("deleting the account from its own card needs the password, then removes it and leaves for the home page (#310, #1447)", async () => {
    const owner = await claimOwner();
    await owner.seed({ entries: [{}] });
    await browser.url(owner.url("/account"));
    await expect($("#delete-account-row")).toHaveElementClass("border-accent");

    await $("#delete-account-edit-btn").click();
    await expect($("#delete-account-form")).toBeDisplayed();
    await $("#delete-account-password").setValue("not-my-password");
    await $("#delete-account-save-btn").click();
    await expect($("#delete-account-error")).toBeDisplayed();
    await expect($("#delete-account-form")).toBeDisplayed();

    await $("#delete-account-password").setValue(owner.password);
    await $("#delete-account-save-btn").click();
    await waitForPath("/");
    await expect($("a*=Sign up")).toBeDisplayed();

    const session = await browserFetch(`${OWNED_ORIGIN}/-/api/auth/get-session`);
    expect(await session.json()).toBeNull();
  });
});
