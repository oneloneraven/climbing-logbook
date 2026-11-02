import { $, browser, expect } from "@wdio/globals";
import { mockTurnstile, waitForTurnstile } from "./wdio-turnstile.js";

describe("feedback page", () => {
  it("submits feedback and shows the success state", async () => {
    await mockTurnstile();
    await browser.url("/help/feedback/");
    await waitForTurnstile();

    await $("#feedback-message").setValue("The grade pyramid view is brilliant, thank you!");
    await $("#feedback-section").selectByAttribute("value", "performance");
    await $("#feedback-submit-btn").click();

    await expect($("#feedback-form")).not.toBeDisplayed();
    await expect($("#feedback-success")).toBeDisplayed();
  });

  it("shows an inline error, keeps the form, and re-enables the button when the request fails", async () => {
    await mockTurnstile();
    const feedback = await browser.mock("**/-/api/feedback");
    feedback.respond({ error: "Something went wrong on our end." }, { statusCode: 500, fetchResponse: false });
    await browser.url("/help/feedback/");
    await waitForTurnstile();

    await $("#feedback-message").setValue("Testing the error path.");
    await $("#feedback-submit-btn").click();

    await expect($("#feedback-error")).toBeDisplayed();
    await expect($("#feedback-error")).toHaveTextContent("Something went wrong on our end.");
    await expect($("#feedback-form")).toBeDisplayed();
    await expect($("#feedback-success")).not.toBeDisplayed();
    await expect($("#feedback-submit-btn")).toBeEnabled();
  });
});
