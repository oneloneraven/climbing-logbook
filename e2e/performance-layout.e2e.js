import { $, $$, browser, expect } from "@wdio/globals";
import { daysAgo } from "./owner.js";
import { claimOwner } from "./wdio-owner.js";

const REPORTS = [
  { path: "pyramid", chart: "climbing-grade-pyramid #pyramid", picker: true },
  { path: "gap", chart: "#gap-root [data-combo-chart]", picker: true },
  { path: "rpe", chart: "#rpe-root [data-combo-chart]", picker: true },
  { path: "trends", chart: "#trends-root [data-combo-chart]", picker: true },
  { path: "injury", chart: null, picker: false },
  { path: "strengths", chart: null, picker: false },
];

describe("performance layout", () => {
  it("every Performance Insights report has one layout: descriptions, pickers, chart, then insights (#1375)", async () => {
    const owner = await claimOwner();
    await owner.settings({ athleteMode: true });
    await owner.grantPainInjuryConsent();
    await owner.seed({ entries: [1, 2, 3, 4, 5].map(n => ({ date: daysAgo(n * 3), grade: "6B", rpe: 60 })) });

    for (const report of REPORTS) {
      const message = report.path;
      await browser.url(owner.url(`/performance/${report.path}`));
      await expect($("#report-insights")).toBeDisplayed({ message });
      await expect($$("#view-explainer > p")).toBeElementsArrayOfSize(2, { message });
      await expect($("#window-note")).not.toExist({ message });

      const order = await browser.execute(
        (chart, picker) => {
          const follows = (a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
          const explainer = document.getElementById("view-explainer");
          const insightsEl = document.getElementById("report-insights");
          const scale = document.getElementById("report-grade-scale-root");
          const chartEl = chart ? document.querySelector(chart) : null;
          const checks = { explainerFirst: follows(explainer, insightsEl) !== 0 };
          if (chartEl) checks.chartBeforeInsights = follows(chartEl, insightsEl) !== 0;
          if (picker) {
            checks.pickerAfterExplainer = follows(explainer, scale) !== 0;
            checks.pickerBeforeChart = follows(scale, chartEl) !== 0;
          } else {
            checks.noPicker = scale === null;
          }
          return checks;
        },
        report.chart,
        report.picker,
      );
      expect({ path: report.path, ...order }).toEqual({
        path: report.path,
        ...Object.fromEntries(Object.keys(order).map(check => [check, true])),
      });
    }
  });
});
