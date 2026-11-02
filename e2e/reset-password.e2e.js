import { $, browser, expect } from "@wdio/globals";

describe("reset password", () => {
  it("shows the expired/invalid state when there's no token in the URL", async () => {
    await browser.url("/reset-password/");

    await expect($("#reset-form")).not.toBeDisplayed();
    await expect($("#reset-invalid")).toBeDisplayed();
  });
});
