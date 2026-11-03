import { $, browser, expect } from "@wdio/globals";
import { waitForPath } from "./wdio-browser.js";
import { claimOwner } from "./wdio-owner.js";
import { athlete, expectOfflineMessage } from "./wdio-performance.js";

const REPORTS = [
  { path: "/performance/pyramid", api: "**/-/api/performance/pyramid**", root: "climbing-grade-pyramid" },
  { path: "/performance/gap", api: "**/-/api/performance/gap**", root: "#gap-root" },
  { path: "/performance/rpe", api: "**/-/api/performance/rpe**", root: "#rpe-root" },
  { path: "/performance/trends", api: "**/-/api/performance/volume**", root: "#trends-root" },
  { path: "/performance/strengths", api: "**/-/api/performance/strengths", root: "#strengths-root" },
  { path: "/performance/injury", api: "**/-/api/performance/injury", root: "#injury-log-root" },
];

describe("performance page", () => {
  it("renders the shared chrome and one tile per insight, linking to its own sub-page", async () => {
    const owner = await claimOwner();
    await owner.settings({ athleteMode: true, activeDiscipline: "boulder" });
    await browser.url(owner.url("/performance"));

    await expect($("climbing-header [data-brand-name]")).toHaveTextContent("Climbing Logbook");
    await expect($("climbing-tab-bar").$("a*=Performance")).toHaveAttribute("aria-current", "page");

    const pyramidTile = $("#insight-pyramid");
    await expect(pyramidTile).toBeDisplayed();
    await expect(pyramidTile.$(".row-card-title")).toHaveTextContent("Grade Pyramid");
    await expect(pyramidTile.$("a*=View")).toHaveAttribute("href", `/${owner.username}/performance/pyramid`);
  });

  it("#599 -- the gap tile's title is discipline-aware and updates live on a discipline switch", async () => {
    const owner = await claimOwner();
    await owner.settings({ athleteMode: true, activeDiscipline: "boulder" });
    await browser.url(owner.url("/performance"));

    const title = $("#insight-gap").$(".row-card-title");
    await expect(title).toHaveTextContent("Send / Flash Gap");

    await $("#discipline-btn").click();
    await $('.discipline-option[data-discipline="sport"]').click();
    await expect(title).toHaveTextContent("Redpoint / Onsight Gap");
  });

  it("every Performance page redirects to /log when Athlete Mode is off", async () => {
    const owner = await claimOwner();
    for (const path of ["/performance", ...REPORTS.map(report => report.path)]) {
      await browser.url(owner.url(path));
      await waitForPath(`/${owner.username}/log`);
    }
  });

  it("every report shows the offline message instead of its view when the device keeps no data and the server fails", async () => {
    const owner = await athlete();
    await owner.grantPainInjuryConsent();
    for (const { path, api, root } of REPORTS) await expectOfflineMessage(owner, path, api, root);
  });
});
