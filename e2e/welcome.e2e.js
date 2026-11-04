import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { CSV_COLUMNS } from "../shared/csv-import.js";
import { PAIN_INJURY_WORDING } from "../shared/health-consent.js";
import {
  chooseFile,
  expectEventually,
  recordFetches,
  tap,
  temporaryFolder,
  textContents,
  waitForPath,
  waitForUrl,
} from "./wdio-browser.js";
import { holdRequests } from "./wdio-hold.js";
import { claimNewOwner, claimOwner } from "./wdio-owner.js";

const pointText = ({ label, text }) => `${label}: ${text}`;
const VALID_CSV = [
  CSV_COLUMNS,
  ["Test Route", "6B", "boulder", "send", "true", "2026-07-30", "Test Crag", "Sector 1", "United Kingdom"],
]
  .map(cells => `${CSV_COLUMNS.map((_, i) => cells[i] ?? "").join(",")}\n`)
  .join("");

const exactText = text => $(`//*[normalize-space(text())=${JSON.stringify(text)}]`);
const heading = text => $(`//*[self::h1 or self::h2][normalize-space()=${JSON.stringify(text)}]`);
const next = () => $("#welcome-next");

async function tapAndWaitForSave(fetches, target) {
  const saved = fetches.next("/-/api/settings", "PATCH");
  await tap(target);
  await saved;
}

describe("welcome", () => {
  beforeEach(() => browser.setViewport({ width: 312, height: 680 }));

  it("a new user's first visit syncs, then walks the steps, then takes the tour, and ends on their logbook", async () => {
    const owner = await claimNewOwner();
    const fetches = await recordFetches();
    await browser.url(owner.url("/log"));
    await waitForPath(`/${owner.username}/welcome`);
    await expect(heading("Who can see your logbook?")).toBeDisplayed();
    await expect($("#welcome-progress-label")).toHaveTextContent("Step 1 of 4");
    await expect($("#welcome-private")).toBeSelected();
    await expect($("#welcome-back")).not.toBeDisplayed();

    await tapAndWaitForSave(fetches, exactText("Public"));
    await tap(next());

    await expect(heading("Athlete Mode")).toBeFocused();
    await expect($("#welcome-athlete-off")).toBeSelected();
    await tapAndWaitForSave(fetches, exactText("On"));
    await expect($("#welcome-progress-label")).toHaveTextContent("Step 2 of 5");
    await tap(next());

    await expect($("//h1[normalize-space()='Health data']")).toBeFocused();
    await expect(next()).toBeDisabled();
    await tap(exactText("Not now"));
    await tap(next());

    await expect(heading("Import your climbs")).toBeDisplayed();
    await expect(next()).toHaveTextContent("Skip for now");
    await tap(next());

    await expect(heading("You're all set")).toBeDisplayed();
    await expect($("#welcome-summary-visibility")).toHaveTextContent("Public");
    await expect($("#welcome-summary-athlete")).toHaveTextContent("On");
    await expect($("#welcome-summary-health")).toHaveTextContent("Off");
    await expect($("#welcome-summary-import")).toHaveTextContent("Skipped");
    expect(await browser.execute(() => document.documentElement.scrollWidth)).toBe(312);

    await tapAndWaitForSave(fetches, next());
    const settings = await (await owner.api("GET", "settings")).json();
    expect(settings).toMatchObject({
      logbookPublic: true,
      athleteMode: true,
      onboardingCompleted: true,
      healthConsent: { painInjury: false },
    });

    await waitForUrl(url => url.pathname === "/intermediatedemo/log" && url.searchParams.get("tour") === "1");
    const tour = $('[role="dialog"][aria-labelledby="tour-title"]');
    await expect(tour).toHaveTextContent(expect.stringContaining("1 of 11"));
    await tap(tour.$('role/button[name="Skip tour"]'));
    await waitForPath(`/${owner.username}/log`);
    await expect($("#add-btn")).toBeDisplayed();

    await browser.refresh();
    await expect($("#add-btn")).toBeDisplayed();
    expect(new URL(await browser.getUrl()).pathname).toBe(`/${owner.username}/log`);
  });

  it("a user who left the setup part-way is sent back to it", async () => {
    const owner = await claimNewOwner();
    await browser.url(owner.url("/log"));
    await waitForPath(`/${owner.username}/welcome`);
    await browser.url(owner.url("/log"));
    await waitForPath(`/${owner.username}/welcome`);
  });

  it("someone who has finished the setup never sees it again", async () => {
    const owner = await claimOwner();
    await browser.url(owner.url("/welcome"));
    await waitForPath(`/${owner.username}/log`);
  });

  it("Back keeps the choices already made", async () => {
    const owner = await claimNewOwner();
    const fetches = await recordFetches();
    await browser.url(owner.url("/welcome"));
    await expect($("#welcome-private")).toBeSelected();
    await tapAndWaitForSave(fetches, exactText("Public"));
    await tap(next());
    await expect(heading("Athlete Mode")).toBeDisplayed();

    await tap($("#welcome-back"));
    await expect(heading("Who can see your logbook?")).toBeFocused();
    await expect($("#welcome-public")).toBeSelected();
  });

  it("importing on step 3 turns Skip into Continue and shows in the summary", async () => {
    const owner = await claimNewOwner();
    await browser.url(owner.url("/welcome"));
    await expect($("#welcome-private")).toBeSelected();
    await tap(next());
    await tap(next());
    await expect(heading("Import your climbs")).toBeDisplayed();

    const file = join(temporaryFolder(), "import.csv");
    writeFileSync(file, VALID_CSV);
    await chooseFile($("#import-file-input"), file);
    await tap($("#import-submit-btn"));
    await expect($("#import-success-message")).toHaveTextContent("Imported 1 entry.");
    await expect(next()).toHaveTextContent("Continue");
    expect(await browser.execute(() => document.documentElement.scrollWidth)).toBe(312);

    await tap(next());
    await expect($("#welcome-summary-import")).toHaveTextContent("1 entry");
  });

  it("a failed save puts the choice back and says so", async () => {
    const owner = await claimNewOwner();
    await browser.url(owner.url("/welcome"));
    await expect($("#welcome-private")).toBeSelected();
    const save = await browser.mock("**/-/api/settings", { method: "PATCH" });
    save.respond({}, { statusCode: 500, fetchResponse: false });

    await tap(exactText("Public"));
    await expect($("#welcome-error")).toHaveTextContent(
      "Couldn't save who can see your logbook. Check your connection and try again.",
    );
    await expect($("#welcome-private")).toBeSelected();
  });

  it("with Athlete Mode on, turning on pain and injury tracking needs the statement ticked, and records it", async () => {
    const owner = await claimNewOwner();
    await owner.settings({ athleteMode: true });
    const fetches = await recordFetches();
    await browser.url(owner.url("/welcome"));
    await expect($("#welcome-progress-label")).toHaveTextContent("Step 1 of 5");
    await tap(next());
    await expect($("#welcome-progress-label")).toHaveTextContent("Step 2 of 5");
    await tap(next());

    await expect($("//h1[normalize-space()='Health data']")).toBeDisplayed();
    await expect($("#welcome-progress-label")).toHaveTextContent("Step 3 of 5");
    await expect($("#welcome-health-on")).not.toBeSelected();
    await expect($("#welcome-health-off")).not.toBeSelected();
    await expectEventually(() => textContents("#welcome-health-points li"), PAIN_INJURY_WORDING.points.map(pointText));

    await tap(exactText("Turn it on"));
    await expect(next()).toBeDisabled();
    await $("#welcome-health-statement-row")
      .$(`role/checkbox[name=${JSON.stringify(PAIN_INJURY_WORDING.statement)}]`)
      .click();
    const grant = fetches.next("/-/api/consent/pain-injury", "POST");
    await tap(next());
    expect(JSON.parse((await grant).body)).toEqual({ version: expect.any(String) });
    await expect(heading("Import your climbs")).toBeDisplayed();

    await tap($("#welcome-back"));
    await expect($("#welcome-health-already-on")).toBeDisplayed();
    await expect($("#welcome-health-choice")).not.toBeDisplayed();
    await tap(next());
    await tap(next());
    await expect($("#welcome-summary-health")).toHaveTextContent("On");
    expect((await (await owner.api("GET", "consent/pain-injury")).json()).granted).toBe(true);
  });

  it("with Athlete Mode off, the pain and injury step is skipped", async () => {
    const owner = await claimNewOwner();
    await browser.url(owner.url("/welcome"));
    await expect($("#welcome-progress-label")).toHaveTextContent("Step 1 of 4");
    await tap(next());
    await expect($("#welcome-athlete-off")).toBeSelected();
    await tap(next());
    await expect(heading("Import your climbs")).toBeDisplayed();
    await expect($("#welcome-progress-label")).toHaveTextContent("Step 3 of 4");
    await tap(next());
    await expect($("#welcome-summary-health-row")).not.toBeDisplayed();
  });

  it("Continue waits for the Athlete Mode save, and a failed save keeps the steps in order", async () => {
    const owner = await claimNewOwner();
    await browser.url(owner.url("/welcome"));
    await tap(next());
    await expect(heading("Athlete Mode")).toBeDisplayed();

    const failSave = await holdRequests("/-/api/settings", { method: "PATCH" });

    await tap(exactText("On"));
    await expect(next()).toBeDisabled();
    await failSave({}, 500);

    await expect($("#welcome-athlete-off")).toBeSelected();
    await expect($("#welcome-error")).toHaveTextContent(
      "Couldn't save Athlete Mode. Check your connection and try again.",
    );
    await expect(next()).toBeEnabled();
    await tap(next());
    await expect(heading("Import your climbs")).toBeDisplayed();
    await expect($("#welcome-progress-label")).toHaveTextContent("Step 3 of 4");
  });
});
