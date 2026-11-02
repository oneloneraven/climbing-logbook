import { $, browser, expect } from "@wdio/globals";

describe("entries table collapse", () => {
  it("a location with entries in only one discipline still starts collapsed when that discipline first renders", async () => {
    await browser.url("/e2e-fixtures/entries-table-harness.html");

    const bothHeader = $('.place-header[data-location-id="loc-both"]');
    await expect(bothHeader).toBeDisplayed();
    await expect(bothHeader).toHaveAttribute("aria-expanded", "false");

    await browser.execute(() => {
      document.querySelector("climbing-entries-table").activeDiscipline = "sport";
    });

    const sportOnlyHeader = $('.place-header[data-location-id="loc-sport-only"]');
    await expect(sportOnlyHeader).toBeDisplayed();
    await expect(sportOnlyHeader).toHaveAttribute("aria-expanded", "false");
  });
});
