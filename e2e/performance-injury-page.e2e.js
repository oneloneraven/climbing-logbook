import { $, $$, browser, expect } from "@wdio/globals";
import { daysAgo } from "./owner.js";
import { expectEventually, textContents } from "./wdio-browser.js";
import { athlete, expectOfflineMessage, expectRedirectToLog, expectSharedChrome } from "./wdio-performance.js";

const LEFT_CRIMP = { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" };
const contains = text => expect.stringContaining(text);

async function consentingAthlete() {
  const owner = await athlete();
  await owner.grantPainInjuryConsent();
  return owner;
}

describe("performance injury page", () => {
  it("shows the no-pain haiku, empty log, and Sources section with no pain-tagged entries", async () => {
    const owner = await consentingAthlete();
    await browser.url(owner.url("/performance/injury"));

    await expectSharedChrome(owner);
    await expect($("#view-explainer")).toHaveTextContent(contains("Pain/injury tags"));
    await expect($("#report-insights")).toHaveTextContent(contains("You have logged no pain"));
    await expect($("#report-insights [data-insight-tone]")).toHaveAttribute("data-insight-tone", "positive");
    await expect($$("#injury-log-list")).toBeElementsArrayOfSize(0);
    await expect($("#injury-log-root")).not.toHaveTextContent(contains("No pain flags logged yet"));
    await expect($("body")).toHaveTextContent(contains("Miro"));
  });

  it("renders the ranked headline and log rows when a cluster clears the confidence gate", async () => {
    const owner = await consentingAthlete();
    await owner.seed({
      entries: [3, 2, 1].map(n => ({ date: daysAgo(n), name: `Painful Route ${4 - n}`, painMoves: [LEFT_CRIMP] })),
    });
    await browser.url(owner.url("/performance/injury"));

    await expect($("#report-insights [data-insight-title]")).toHaveTextContent("Pattern identified");
    await expect($("#report-insights")).toHaveTextContent(
      contains("3 of your 3 pain flags are on your left hand on overhanging crimps."),
    );
    await expect($("#report-insights [data-insight-tone]")).toHaveAttribute("data-insight-tone", "negative");
    await expectEventually(
      () => textContents("#injury-log-list .row-card-title"),
      ["Painful Route 3", "Painful Route 2", "Painful Route 1"],
    );
  });

  it("shows the offline message instead of the log when the device keeps no data and the server fails", async () => {
    const owner = await consentingAthlete();
    await expectOfflineMessage(owner, "/performance/injury", "**/-/api/performance/injury", "#injury-log-root");
  });

  it("redirects to /log when Athlete Mode is off", () => expectRedirectToLog("/performance/injury"));
});
