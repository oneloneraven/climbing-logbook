import { $, browser, expect } from "@wdio/globals";
import { ENGAGE_SUBMISSIONS_URL } from "../client/engage-submission.js";
import { recordFetches } from "./wdio-browser.js";
import { mockEngage } from "./wdio-engage.js";
import { signInDevUser } from "./wdio-owner.js";
import { mockTurnstile, waitForTurnstile } from "./wdio-turnstile.js";

describe("report an issue page", () => {
  it("sends a report to Engage, with the error reference as context, and shows the success state", async () => {
    await mockTurnstile();
    await mockEngage();
    const fetches = await recordFetches();
    await browser.url("/help/report-an-issue/?ref=err-123");
    await waitForTurnstile();

    await $("#report-issue-message").setValue("The map pin popover doesn't close when I click elsewhere.");
    await $("#report-issue-section").selectByAttribute("value", "map");
    const submitted = fetches.next(ENGAGE_SUBMISSIONS_URL, "POST");
    await $("#report-issue-submit-btn").click();

    await expect($("#report-issue-form")).not.toBeDisplayed();
    await expect($("#report-issue-success")).toBeDisplayed();
    expect(JSON.parse((await submitted).body)).toEqual({
      product: "cl",
      kind: "issue",
      source: "web",
      message: "The map pin popover doesn't close when I click elsewhere.",
      section: "map",
      turnstileToken: "e2e-stub-token",
      context: { errorRef: "err-123" },
    });
  });

  it("sends a signed-in reporter's account, so deleting the account can clear it", async () => {
    await signInDevUser();
    await mockTurnstile();
    await mockEngage();
    const fetches = await recordFetches();
    await browser.url("/help/report-an-issue/");
    await waitForTurnstile();
    const userId = await browser.execute(async () => (await (await fetch("/-/api/auth/get-session")).json()).user.id);

    await $("#report-issue-message").setValue("Signed in and reporting.");
    const submitted = fetches.next(ENGAGE_SUBMISSIONS_URL, "POST");
    await $("#report-issue-submit-btn").click();

    await expect($("#report-issue-success")).toBeDisplayed();
    expect(JSON.parse((await submitted).body).accountRef).toBe(userId);
  });

  it("shows an inline error, keeps what was typed, and re-enables the button when Engage refuses it", async () => {
    await mockTurnstile();
    await mockEngage({ status: 400, body: { error: "verification-failed" } });
    await browser.url("/help/report-an-issue/");
    await waitForTurnstile();

    await $("#report-issue-message").setValue("Testing the error path.");
    await $("#report-issue-submit-btn").click();

    await expect($("#report-issue-error")).toBeDisplayed();
    await expect($("#report-issue-error")).toHaveTextContent("Bot verification failed. Please try again.");
    await expect($("#report-issue-message")).toHaveValue("Testing the error path.");
    await expect($("#report-issue-form")).toBeDisplayed();
    await expect($("#report-issue-success")).not.toBeDisplayed();
    await expect($("#report-issue-submit-btn")).toBeEnabled();
  });

  it("sends the version from the footer link, and drops one that isn't a version (#1500)", async () => {
    await mockTurnstile();
    await mockEngage();
    const fetches = await recordFetches();
    const sent = [];
    for (const version of ["v2.139.1", "nonsense"]) {
      await browser.url(`/help/report-an-issue/?version=${version}`);
      await waitForTurnstile();
      await $("#report-issue-message").setValue("Testing the version.");
      const submitted = fetches.next(ENGAGE_SUBMISSIONS_URL, "POST");
      await $("#report-issue-submit-btn").click();
      sent.push(JSON.parse((await submitted).body).appVersion);
      await expect($("#report-issue-success")).toBeDisplayed();
    }
    expect(sent).toEqual(["2.139.1", undefined]);
  });
});
