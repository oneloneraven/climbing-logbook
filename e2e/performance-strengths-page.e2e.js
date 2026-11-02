import { $, $$, browser, expect } from "@wdio/globals";
import { athlete, expectOfflineMessage, expectRedirectToLog, expectSharedChrome } from "./wdio-performance.js";

const contains = text => expect.stringContaining(text);

describe("performance strengths page", () => {
  it("shows the not-enough-data message and Sources section with no wall angles", async () => {
    const owner = await athlete();
    await browser.url(owner.url("/performance/strengths"));

    await expectSharedChrome(owner);
    await expect($("#view-explainer")).toHaveTextContent(contains("Hardest move/sequence"));
    await expect($("#report-insights")).toHaveTextContent(contains("Not enough data yet"));
    await expect($$("#strengths-angles")).toBeElementsArrayOfSize(0);
    await expect($("body")).toHaveTextContent(contains("MacLeod"));
  });

  it("shows the findings, the grade by wall angle and what makes climbs hard (#1523)", async () => {
    const owner = await athlete();
    await owner.seed({
      entries: [
        ...["7A", "7A", "7A"].map(grade => ({
          grade,
          wallAngle: "overhang",
          hardestBeta: "heel hook, deadpoint to the crimp",
        })),
        ...["6A", "6A", "6A"].map(grade => ({ grade, wallAngle: "slab" })),
      ],
    });
    await browser.url(owner.url("/performance/strengths"));

    await expect($("#report-insights")).toHaveTextContent(contains("Slab is your weak angle"));
    await expect($("#report-insights")).toHaveTextContent(contains("Deadpoint: only at your limit"));
    await expect($("#strengths-angles")).toBeDisplayed();
    await expect($('role/img[name="Your level on each wall angle"]')).toHaveTextContent(contains("Slab · 6A"));
    await expect($('role/img[name="What makes climbs hard for you"]')).toHaveTextContent(contains("Deadpoint"));
    await expect($('role/table[name="Where your cruxes are"]')).toHaveTextContent(contains("Crimp"));
  });

  it("shows the offline message instead of the view when the device keeps no data and the server fails", async () => {
    const owner = await athlete();
    await expectOfflineMessage(owner, "/performance/strengths", "**/-/api/performance/strengths", "#strengths-root");
  });

  it("redirects to /log when Athlete Mode is off", () => expectRedirectToLog("/performance/strengths"));
});
