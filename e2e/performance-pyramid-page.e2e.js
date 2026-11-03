import { $, browser, expect } from "@wdio/globals";
import { athlete, expectSharedChrome } from "./wdio-performance.js";

const contains = text => expect.stringContaining(text);

describe("performance pyramid page", () => {
  it("renders the shared chrome and a real grade pyramid, and switches discipline", async () => {
    const owner = await athlete();
    await owner.settings({ activeDiscipline: "boulder" });
    await owner.seed({ entries: [{ type: "boulder" }, { type: "sport", grade: "6a" }] });
    await browser.url(owner.url("/performance/pyramid"));

    await expectSharedChrome(owner);
    await expect($("#view-explainer")).toHaveTextContent(contains("every send's grade"));

    // The empty state shows before an unsynced device's /sync round trip, so wait for the seeded send.
    await expect($("#pyramid")).toHaveTextContent(contains("6A"));
    await expect($("#performance-offline")).not.toBeDisplayed();

    await $("#discipline-btn").click();
    await $('.discipline-option[data-discipline="sport"]').click();
    await expect($("#discipline-btn-label")).toHaveTextContent("Sport");

    await $("#discipline-btn").click();
    await $('.discipline-option[data-discipline="boulder"]').click();
    await expect($("#discipline-btn-label")).toHaveTextContent("Boulder");
  });
});
