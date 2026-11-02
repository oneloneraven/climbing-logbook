import { $, $$, browser, expect } from "@wdio/globals";
import { d1Execute, d1Query } from "../scripts/lib/dev-session.mjs";
import { TERMS_VERSION } from "../shared/terms.js";
import { recordFetches, settle } from "./wdio-browser.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

const D1 = { database: "climbing-logbook-preview", env: "preview" };
const termsDialog = () => $(`role/dialog[name="We're updating our terms of use"]`);

describe("terms prompt", () => {
  it("an account on older terms is asked to agree, and its saves wait until it does (#1354)", async () => {
    const owner = await claimOwner();
    await owner.seed({
      locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
      places: [{ id: "p1", locationId: "l1", area: "" }],
    });
    await gotoSyncedLog(owner);
    await expect($$("role/dialog")).toBeElementsArrayOfSize(0);

    d1Execute(`UPDATE "user" SET termsVersion = NULL WHERE username = '${owner.username}'`, D1);
    const record = {
      id: owner.ownId("waiting"),
      name: "Waits for the terms",
      grade: "6B",
      placeId: owner.ownId("p1"),
      type: "boulder",
      status: "send",
    };
    await browser.execute(
      (key, record) => localStorage.setItem(key, JSON.stringify([{ kind: "entry", op: "add", record }])),
      `logbook_pending_queue:${owner.username}`,
      record,
    );

    const fetches = await recordFetches();
    await browser.refresh();
    await expect(termsDialog()).toBeDisplayed();
    await expect(termsDialog()).toHaveTextContent(expect.stringContaining("Who can't use Climbing Logbook"));
    await termsDialog().$('role/button[name="Not now"]').click();
    await expect(termsDialog()).not.toBeDisplayed();

    const refused = fetches.next("/-/api/entries", "POST");
    await $("#sync-now").click();
    expect((await refused).status).toBe(428);
    await expect($("#sync-line-text")).toHaveTextContent("1 change waiting to sync");

    await browser.refresh();
    await expect(termsDialog()).toBeDisplayed();
    await termsDialog().$('role/button[name="I agree"]').click();
    await expect(termsDialog()).not.toBeDisplayed();
    await expect($("#sync-line")).not.toBeDisplayed();

    const [user] = d1Query(`SELECT termsVersion FROM "user" WHERE username = '${owner.username}'`, D1);
    expect(user.termsVersion).toBe(TERMS_VERSION);
    expect(d1Query(`SELECT name FROM entries WHERE id = '${record.id}'`, D1)).toEqual([{ name: record.name }]);

    await browser.refresh();
    await expect($("climbing-entries-table")).toBeDisplayed();
    await settle();
    await expect($$("role/dialog")).toBeElementsArrayOfSize(0);
  });
});
