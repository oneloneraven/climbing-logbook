import { $, browser, expect } from "@wdio/globals";
import { ENGAGE_SUBMISSIONS_URL } from "../client/engage-submission.js";
import { recordFetches } from "./wdio-browser.js";
import { mockEngage } from "./wdio-engage.js";
import { mockTurnstile, waitForTurnstile } from "./wdio-turnstile.js";

describe("feedback page", () => {
  it("sends feedback to Engage and shows the success state", async () => {
    await mockTurnstile();
    await mockEngage();
    const fetches = await recordFetches();
    await browser.url("/help/feedback/?version=v2.139.1");
    await waitForTurnstile();

    await $("#feedback-message").setValue("The grade pyramid view is brilliant, thank you!");
    await $("#feedback-email").setValue("climber@example.com");
    await $("#feedback-section").selectByAttribute("value", "performance");
    const submitted = fetches.next(ENGAGE_SUBMISSIONS_URL, "POST");
    await $("#feedback-submit-btn").click();

    await expect($("#feedback-form")).not.toBeDisplayed();
    await expect($("#feedback-success")).toBeDisplayed();
    expect(JSON.parse((await submitted).body)).toEqual({
      product: "cl",
      kind: "feedback",
      source: "web",
      message: "The grade pyramid view is brilliant, thank you!",
      contactEmail: "climber@example.com",
      section: "performance",
      appVersion: "2.139.1",
      turnstileToken: "e2e-stub-token",
    });
  });

  it("sends consent to quote, with the credit and name chosen", async () => {
    await mockTurnstile();
    await mockEngage();
    const fetches = await recordFetches();
    await browser.url("/help/feedback/");
    await waitForTurnstile();

    await $("#feedback-message").setValue("Best logbook I've used.");
    await $("#feedback-quote-consent").click();
    await $('input[name="credit"][value="initials"]').click();
    await $("#feedback-name").setValue("Nix Climber");
    const submitted = fetches.next(ENGAGE_SUBMISSIONS_URL, "POST");
    await $("#feedback-submit-btn").click();

    await expect($("#feedback-success")).toBeDisplayed();
    expect(JSON.parse((await submitted).body)).toMatchObject({
      quoteConsent: true,
      credit: "initials",
      contactName: "Nix Climber",
    });
  });

  it("shows an inline error, keeps what was typed, and re-enables the button when Engage refuses it", async () => {
    await mockTurnstile();
    await mockEngage({ status: 429, body: { error: "rate-limited" } });
    await browser.url("/help/feedback/");
    await waitForTurnstile();

    await $("#feedback-message").setValue("Testing the error path.");
    await $("#feedback-submit-btn").click();

    await expect($("#feedback-error")).toBeDisplayed();
    await expect($("#feedback-error")).toHaveTextContent(
      "Too much feedback from this connection. Please try again later.",
    );
    await expect($("#feedback-form")).toBeDisplayed();
    await expect($("#feedback-message")).toHaveValue("Testing the error path.");
    await expect($("#feedback-success")).not.toBeDisplayed();
    await expect($("#feedback-submit-btn")).toBeEnabled();
  });
});
