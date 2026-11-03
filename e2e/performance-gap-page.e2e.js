import { $, browser, expect } from "@wdio/globals";
import { daysAgo } from "./owner.js";
import { athlete, chooseReportScale, expectSharedChrome, expectWiderWindowRefetch } from "./wdio-performance.js";

const FLASH_AND_SENDS = [
  { date: daysAgo(15), grade: "6B", firstAttempt: true, attemptsToSend: 1 },
  { date: daysAgo(15), grade: "6B", attemptsToSend: 2 },
  { date: daysAgo(2), grade: "6C", attemptsToSend: 3 },
];
const contains = text => expect.stringContaining(text);

describe("performance gap page", () => {
  it("shows the zero-sends headline, time-window control, and Sources section with no data", async () => {
    const owner = await athlete();
    await browser.url(owner.url("/performance/gap"));

    await expectSharedChrome(owner);
    await expect($("#view-explainer")).toHaveTextContent(contains("Attempts count and Flash selection"));
    await expect($('[data-window="12w"]')).toBeDisplayed();
    await expect($("#gap-root")).toHaveTextContent(contains("You have logged no sends"));
    await expect($("body")).toHaveTextContent(contains("Climbstat"));
  });

  it("renders both grade-labeled line series and the attempts bar", async () => {
    const owner = await athlete();
    await owner.seed({ entries: FLASH_AND_SENDS });
    await browser.url(owner.url("/performance/gap"));

    // 6B+ sits between them: two named steps, not one.
    await expect($("#gap-root")).toHaveTextContent(contains("2 grade-steps ahead"));
    await expect($("#gap-root [data-combo-chart]")).toBeDisplayed();
    await expect($("#gap-root")).toHaveTextContent(contains("6B"));
    await expect($("#gap-root")).toHaveTextContent(contains("6C"));
    await expect($("#gap-root [data-combo-chart]")).toHaveTextContent(contains("–"));
  });

  it("switching the report grade scale relabels both grade line series", async () => {
    const owner = await athlete();
    await owner.seed({ entries: FLASH_AND_SENDS });
    await browser.url(owner.url("/performance/gap"));
    await expect($("#gap-root")).toHaveTextContent(contains("6B"));

    await chooseReportScale("V-scale");
    await expect($("#gap-root")).toHaveTextContent(contains("V4")); // reportGradeLabel("6B", "boulder", "v-scale")
    await expect($("#gap-root")).toHaveTextContent(contains("V5")); // reportGradeLabel("6C", "boulder", "v-scale")
  });

  it("on a device that keeps no data, switching the time window to 52w re-fetches with a wider range", async () => {
    const owner = await athlete();
    await expectWiderWindowRefetch(owner.url("/performance/gap"), "gap");
  });
});
