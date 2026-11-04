import { $, $$, browser, expect } from "@wdio/globals";
import { PAIN_INJURY_WORDING } from "../shared/health-consent.js";
import { expectEventually, goOffline, recordFetches, textContents } from "./wdio-browser.js";
import { claimOwner } from "./wdio-owner.js";

const pointText = ({ label, text }) => `${label}: ${text}`;
const PAIN = { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" };
const contains = text => expect.stringContaining(text);
const consentBox = () => $("#health-grant").$(`role/checkbox[name=${JSON.stringify(PAIN_INJURY_WORDING.statement)}]`);

describe("account health page", () => {
  it("off: explains it, and Turn on waits for the box and records the current wording", async () => {
    const owner = await claimOwner();
    const fetches = await recordFetches();
    await browser.url(owner.url("/account/health"));

    await expect($("//h1[normalize-space()='Health data']")).toBeDisplayed();
    await expectEventually(() => textContents("#health-points li"), PAIN_INJURY_WORDING.points.map(pointText));
    await expect($("#health-statement")).toHaveTextContent(PAIN_INJURY_WORDING.statement);
    await expect($("#health-withdraw")).not.toBeDisplayed();

    const turnOn = $("#health-grant").$('role/button[name="Turn on"]');
    await expect(turnOn).toBeDisabled();
    await consentBox().click();

    const post = fetches.next("/-/api/consent/pain-injury", "POST");
    await turnOn.click();
    expect(JSON.parse((await post).body)).toEqual({ version: expect.any(String) });
    await expect($("#health-title")).toBeFocused();
    await expect($("#health-withdraw").$('role/button[name="Turn off and delete"]')).toBeDisplayed();
    await expect($("#health-grant")).not.toBeDisplayed();
  });

  it("on: the warning says what turning off deletes, and one button deletes it", async () => {
    const owner = await claimOwner();
    await owner.grantPainInjuryConsent();
    await owner.seed({ entries: [{ painMoves: [PAIN] }, { painMoves: [PAIN, { ...PAIN, side: "right" }] }, {}] });
    await browser.url(owner.url("/account/health"));

    await expect($("#health-withdraw")).toHaveTextContent(
      contains("Turning this off deletes all your health information."),
    );
    await expect($("#health-withdraw")).toHaveTextContent(contains("from our backups within 30 days"));
    await expect($("#health-count")).toHaveTextContent("You have pain and injury details on 2 entries.");
    await expect($$("#health-withdraw button")).toBeElementsArrayOfSize(1);

    await $("#health-withdraw").$('role/button[name="Turn off and delete"]').click();
    await expect($("#health-title")).toBeFocused();
    await expect($("#health-grant")).toBeDisplayed();
    await expect($("#health-withdraw")).not.toBeDisplayed();

    const status = await (await owner.api("GET", "consent/pain-injury")).json();
    expect(status).toMatchObject({ granted: false, entriesWithPain: 0 });
  });

  it("My Account shows the card with its state and links to the page", async () => {
    const owner = await claimOwner();
    await owner.settings({ athleteMode: true });
    await browser.url(owner.url("/account"));
    await expect($("#health-status")).toHaveTextContent("Off");

    await owner.grantPainInjuryConsent();
    await owner.settings({ athleteMode: false });
    await browser.refresh();

    const row = $("#health-row");
    await expect(row).toHaveTextContent(contains("Health data"));
    await expect($("#health-status")).toHaveTextContent("On");
    await expect(row).toHaveAttribute("href", `/${owner.username}/account/health`);
  });

  it("offline: the buttons are disabled with a note, and come back with the connection", async () => {
    const owner = await claimOwner();
    await browser.url(owner.url("/account/health"));
    const turnOn = $("#health-grant").$('role/button[name="Turn on"]');
    await expect(turnOn).toBeDisplayed();
    await consentBox().click();
    await expect(turnOn).toBeEnabled();

    const backOnline = await goOffline();
    await expect(turnOn).toBeDisabled();
    await expect($("#health-offline-note")).toBeDisplayed();

    await backOnline();
    await expect(turnOn).toBeEnabled();
    await expect($("#health-offline-note")).not.toBeDisplayed();
  });

  it("My Account hides the card when Athlete Mode is off and tracking was never turned on", async () => {
    const owner = await claimOwner();
    await browser.url(owner.url("/account"));
    await expect($("#beta-row")).toBeDisplayed();
    await expect($("#health-row")).not.toBeDisplayed();
  });
});
