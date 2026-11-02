import { $, browser, expect } from "@wdio/globals";
import { daysAgo } from "./owner.js";
import {
  athlete,
  chooseReportScale,
  expectOfflineMessage,
  expectRedirectToLog,
  expectSharedChrome,
  expectWiderWindowRefetch,
} from "./wdio-performance.js";

const RISING_EFFORT = [
  ...[1, 2, 3].map(() => ({ date: daysAgo(30), grade: "6B", rpe: 70 })),
  ...[1, 2].map(() => ({ date: daysAgo(2), grade: "6C", rpe: 80 })),
];
const contains = text => expect.stringContaining(text);

describe("performance RPE page", () => {
  it("shows the confidence-gate message, time-window control, and Sources section below the sample threshold", async () => {
    const owner = await athlete();
    await browser.url(owner.url("/performance/rpe"));

    await expectSharedChrome(owner);
    await expect($("#view-explainer")).toHaveTextContent(contains("Exertion slider"));
    await expect($("#view-explainer")).toHaveTextContent(contains("less reliable"));
    await expect($('[data-window="12w"]')).toBeDisplayed();
    await expect($("#rpe-root")).toHaveTextContent(contains("Rate the Exertion on at least 5 sends"));
    await expect($("body")).toHaveTextContent(contains("Gajdošík"));
  });

  it("renders the exertion bars and grade-labeled line once the confidence gate clears", async () => {
    const owner = await athlete();
    await owner.seed({ entries: RISING_EFFORT });
    await browser.url(owner.url("/performance/rpe"));

    await expect($("#rpe-root [data-insight-title]")).toHaveTextContent("Effort and grade are both rising");
    await expect($("#rpe-root")).toHaveTextContent(
      contains("Your average Exertion went from 70% to 80% and your top grade from 6B to 6C"),
    );
    await expect($("#rpe-root [data-combo-chart]")).toBeDisplayed();
    await expect($("#rpe-root")).toHaveTextContent(contains("6B"));
    await expect($("#rpe-root")).toHaveTextContent(contains("6C"));
    await expect($("#rpe-root [data-combo-chart]")).toHaveTextContent(contains("–"));
  });

  it("switching the report grade scale relabels the chart's grade point", async () => {
    const owner = await athlete();
    await owner.seed({ entries: RISING_EFFORT });
    await browser.url(owner.url("/performance/rpe"));
    await expect($("#rpe-root")).toHaveTextContent(contains("6B"));

    await chooseReportScale("V-scale");
    await expect($("#rpe-root")).toHaveTextContent(contains("V4")); // reportGradeLabel("6B", "boulder", "v-scale")
    await expect($("#rpe-root")).toHaveTextContent(contains("V5")); // reportGradeLabel("6C", "boulder", "v-scale")
  });

  it("on a device that keeps no data, switching the time window to 52w re-fetches with a wider range", async () => {
    const owner = await athlete();
    await expectWiderWindowRefetch(owner.url("/performance/rpe"), "rpe");
  });

  it("shows the offline message instead of the chart when the device keeps no data and the server fails", async () => {
    const owner = await athlete();
    await expectOfflineMessage(owner, "/performance/rpe", "**/-/api/performance/rpe**", "#rpe-root");
  });

  it("redirects to /log when Athlete Mode is off", () => expectRedirectToLog("/performance/rpe"));
});
