import { $, browser, expect } from "@wdio/globals";
import { recordFetches } from "./wdio-browser.js";
import { mockTurnstile, waitForTurnstile } from "./wdio-turnstile.js";

describe("report an issue page", () => {
  it("submits a report and shows the success state", async () => {
    await mockTurnstile();
    await browser.url("/help/report-an-issue/");
    await waitForTurnstile();

    await $("#report-issue-message").setValue("The map pin popover doesn't close when I click elsewhere.");
    await $("#report-issue-section").selectByAttribute("value", "map");
    await $("#report-issue-submit-btn").click();

    await expect($("#report-issue-form")).not.toBeDisplayed();
    await expect($("#report-issue-success")).toBeDisplayed();
  });

  it("shows an inline error, keeps the form, and re-enables the button when the request fails", async () => {
    await mockTurnstile();
    const report = await browser.mock("**/-/api/report-issue");
    report.respond({ error: "Something went wrong on our end." }, { statusCode: 500, fetchResponse: false });
    await browser.url("/help/report-an-issue/");
    await waitForTurnstile();

    await $("#report-issue-message").setValue("Testing the error path.");
    await $("#report-issue-submit-btn").click();

    await expect($("#report-issue-error")).toBeDisplayed();
    await expect($("#report-issue-error")).toHaveTextContent("Something went wrong on our end.");
    await expect($("#report-issue-form")).toBeDisplayed();
    await expect($("#report-issue-success")).not.toBeDisplayed();
    await expect($("#report-issue-submit-btn")).toBeEnabled();
  });

  it("sends the version from the footer link, and drops one that isn't a version (#1500)", async () => {
    await mockTurnstile();
    const report = await browser.mock("**/-/api/report-issue");
    report.respond({ ok: true }, { statusCode: 201, fetchResponse: false });
    const fetches = await recordFetches();
    const sent = [];
    for (const version of ["v2.139.1", "nonsense"]) {
      await browser.url(`/help/report-an-issue/?version=${version}`);
      await waitForTurnstile();
      await $("#report-issue-message").setValue("Testing the version.");
      const submitted = fetches.next("/-/api/report-issue", "POST");
      await $("#report-issue-submit-btn").click();
      sent.push(JSON.parse((await submitted).body).appVersion);
      await expect($("#report-issue-success")).toBeDisplayed();
    }
    expect(sent).toEqual(["v2.139.1", undefined]);
  });
});
