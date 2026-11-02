import { $, $$, browser, expect } from "@wdio/globals";
import { clearCookies } from "./wdio-browser.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";
import { mockTurnstile, waitForTurnstile } from "./wdio-turnstile.js";

const ADMIN = "http://admin.localhost:8787";
const contains = text => expect.stringContaining(text);
const rowWith = text => $(`//tr[contains(normalize-space(.), ${JSON.stringify(text)})]`);

describe("report and hide", () => {
  it("a visitor reports a climb on a public logbook, the admin hides it, and only its owner still sees it", async () => {
    const owner = await claimOwner();
    const climb = `Scam beta ${Date.now()}`;
    await owner.seed({ entries: [{ name: climb, notes: "Cheap gear at scam.example" }, { name: "Fine climb" }] });
    await clearCookies();

    await browser.url(owner.url(""));
    await $("#header-menu-btn").click();
    const logbookLink = $('role/link[name="Report this logbook"]');
    const logbookHref = new URL(await logbookLink.getAttribute("href"), await browser.getUrl());
    expect(logbookHref.pathname).toBe("/help/report-an-issue/");
    expect(logbookHref.searchParams.get("logbook")).toBe(owner.username);
    expect(logbookHref.searchParams.get("version")).toMatch(/^(dev|v\d+\.\d+\.\d+)$/);

    await browser.keys("Escape");
    await $("#collapse-all-btn").click();
    await rowWith(climb).$(".notes-btn").click();
    const climbLink = $("#notes-report-link");
    await expect(climbLink).toBeDisplayed();
    const reportHref = await climbLink.getAttribute("href");
    expect(reportHref).toContain(`logbook=${owner.username}&climb=`);

    await mockTurnstile();
    await browser.url(new URL(reportHref).pathname + new URL(reportHref).search);
    await expect($("#report-about")).toHaveTextContent(
      `You're reporting an entry in ${owner.username}'s public logbook.`,
    );
    await expect($("#report-issue-section")).toHaveValue("public_logbook");
    await waitForTurnstile();
    await $("#report-issue-message").setValue(`Scam link in the notes (${climb})`);
    await $("#report-issue-submit-btn").click();
    await expect($("#report-issue-success")).toBeDisplayed();

    await browser.url(`${ADMIN}/reports`);
    await $("#submission-list").$(`a*=${climb}`).click();
    await expect($("#detail-fields")).toHaveTextContent(contains(`${owner.username}'s public logbook`));
    const reported = $("#reported-climb");
    await expect(reported).toHaveTextContent(contains(climb));
    await expect(reported).toHaveTextContent(contains("Cheap gear at scam.example"));
    await expect(reported).toHaveTextContent(contains("Showing"));
    await $("#toggle-hidden").click();
    await expect(reported).toHaveTextContent(contains("Hidden"));
    await expect($("#toggle-hidden")).toHaveTextContent("Unhide this entry");

    const publicEntries = await (
      await fetch(owner.url("").replace(/\/[^/]+\/?$/, `/-/api/public/${owner.username}/entries`))
    ).json();
    expect(publicEntries.entries.map(entry => entry.name)).toEqual(["Fine climb"]);

    await browser.url(`${ADMIN}/activity`);
    await expect($$("#activity-list li")[0]).toHaveTextContent(contains(`Hid an entry of ${owner.username}: ${climb}`));

    await owner.signInAgain();
    await gotoSyncedLog(owner);
    await $("#collapse-all-btn").click();
    const ownRow = rowWith(climb);
    await expect(ownRow).toHaveTextContent(contains("Hidden (Why?)"));
    await expect(ownRow.$('role/link[name="Why is this hidden from my public logbook?"]')).toHaveAttribute(
      "href",
      "/help/terms/#hidden-climbs",
    );
  });

  it("your own logbook offers no way to report a climb", async () => {
    const owner = await claimOwner();
    await owner.seed({ entries: [{ name: "Mine", notes: "My note" }] });
    await gotoSyncedLog(owner);
    await $("#collapse-all-btn").click();
    await $$(".notes-btn")[0].click();
    await expect($("#notes-modal-text")).toHaveTextContent("My note");
    await expect($("#notes-report-link")).not.toBeDisplayed();
  });
});
