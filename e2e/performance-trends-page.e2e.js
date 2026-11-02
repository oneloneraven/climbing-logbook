import { $, $$, browser, expect } from "@wdio/globals";
import { daysAgo } from "./owner.js";
import {
  athlete,
  blockIndexedDb,
  chooseReportScale,
  expectOfflineMessage,
  expectRedirectToLog,
  expectSharedChrome,
  expectWiderWindowRefetch,
} from "./wdio-performance.js";

const TEN_SENDS = [
  ...[1, 2].map(() => ({ date: daysAgo(22), grade: "6A" })),
  ...[1, 2, 3, 4, 5].map(() => ({ date: daysAgo(15), grade: "6B" })),
  ...[1, 2, 3].map(() => ({ date: daysAgo(2), grade: "6C" })),
];
const contains = text => expect.stringContaining(text);

describe("performance trends page", () => {
  it("shows the zero-sends headline, time-window control, and Sources section with no data", async () => {
    const owner = await athlete();
    await browser.url(owner.url("/performance/trends"));

    await expectSharedChrome(owner);
    await expect($("#view-explainer")).toHaveTextContent(contains("every logged send's grade"));
    await expect($("#view-explainer")).toHaveTextContent(contains("send-log proxy"));
    await expect($('[data-window="12w"]')).toBeDisplayed();
    await expect($("#trends-root")).toHaveTextContent(contains("You have logged no sends"));
    await expect($("body")).toHaveTextContent(contains("Bechtel"));
  });

  it("renders real bars and a grade-labeled line point", async () => {
    const owner = await athlete();
    await owner.seed({ entries: TEN_SENDS });
    await browser.url(owner.url("/performance/trends"));

    await expect($("#trends-root")).toHaveTextContent(
      contains("10 sends logged in this window, busiest period had 5."),
    );
    await expect($("#trends-root [data-combo-chart]")).toBeDisplayed();
    await expect($("#trends-root")).toHaveTextContent(contains("6B"));
  });

  it("switching the report grade scale relabels the chart's grade point", async () => {
    const owner = await athlete();
    await owner.seed({ entries: TEN_SENDS });
    await browser.url(owner.url("/performance/trends"));
    await expect($("#trends-root")).toHaveTextContent(contains("6B"));

    await chooseReportScale("V-scale");
    await expect($("#trends-root")).toHaveTextContent(contains("V4")); // reportGradeLabel("6B", "boulder", "v-scale")

    expect(await browser.execute(() => localStorage.getItem("logbook_grade_scale_reports_boulder"))).toBe("v-scale");
  });

  it("on a device that keeps no data, switching the time window to 52w re-fetches with a wider range", async () => {
    const owner = await athlete();
    await expectWiderWindowRefetch(owner.url("/performance/trends"), "volume");
  });

  it("Custom range: on a device that keeps no data, picking a start date via the calendar popover re-fetches with that date", async () => {
    const owner = await athlete();
    await blockIndexedDb();
    await browser.url(owner.url("/performance/trends"));
    await expect($('[data-window="custom"]')).toBeDisplayed();

    await $('[data-window="custom"]').click();
    await $("#time-window-start-btn").click();
    await expect($("#time-window-start-popover")).toBeDisplayed();

    const dayCell = $$("#time-window-start-grid button[data-date]")[0];
    const pickedDate = await dayCell.getAttribute("data-date");
    const volume = await browser.mock("**/-/api/performance/volume**");
    await dayCell.click();

    await expect($("#time-window-start-popover")).not.toBeDisplayed();
    await browser.waitUntil(
      () => volume.calls.some(call => new URL(call.request.url).searchParams.get("start") === pickedDate),
      { timeoutMsg: `no volume request starting ${pickedDate}` },
    );

    const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const [, y, mo, d] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(pickedDate);
    await expect($("#time-window-root")).toHaveTextContent(contains(`${MONTHS_SHORT[+mo - 1]} ${+d}, ${y}`));
  });

  it("shows the offline message instead of the chart when the device keeps no data and the server fails", async () => {
    const owner = await athlete();
    await expectOfflineMessage(owner, "/performance/trends", "**/-/api/performance/volume**", "#trends-root");
  });

  it("redirects to /log when Athlete Mode is off", () => expectRedirectToLog("/performance/trends"));

  it("judges the window: more sends and a higher top grade stack a positive card above the summary (#1380)", async () => {
    const owner = await athlete();
    await owner.seed({
      entries: [
        ...[1, 2, 3, 4, 5].map(() => ({ date: daysAgo(70), grade: "6A" })),
        ...[1, 2, 3, 4, 5, 6, 7].map(() => ({ date: daysAgo(5), grade: "6A" })),
        { date: daysAgo(3), grade: "6B" },
      ],
    });
    await browser.url(owner.url("/performance/trends"));

    const cards = $$("#report-insights [data-insight-tone]");
    await expect(cards).toBeElementsArrayOfSize(2);
    await expect(cards[0]).toHaveAttribute("data-insight-tone", "positive");
    await expect(cards[0]).toHaveTextContent(contains("climbing more and harder"));
    await expect(cards[1]).toHaveTextContent(contains("13 sends logged in this window"));
  });
});
