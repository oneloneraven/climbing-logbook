import { $, browser, expect } from "@wdio/globals";
import { OWNED_ORIGIN } from "./owned-route-url.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

const READ_ONLY = { error: "Climbing Logbook can't save changes for a few minutes.", code: "READ_ONLY" };

async function refuseWrites(pattern, method) {
  const writes = await browser.mock(pattern, { method });
  writes.respond(READ_ONLY, { statusCode: 503, headers: { "Retry-After": "300" }, fetchResponse: false });
  return writes;
}

async function syncAndWait() {
  await $("#sync-now").click();
  await expect($("#sync-line")).not.toBeDisplayed();
}

const savedNames = async owner => (await (await owner.api("GET", "entries")).json()).entries.map(entry => entry.name);

describe("read-only mode", () => {
  it("in read-only mode a climb saved online is queued, then syncs once writes are back (#1063)", async () => {
    const owner = await claimOwner();
    await owner.seed({ entries: [{ name: "Already here" }] });
    await gotoSyncedLog(owner);

    const writes = await refuseWrites("**/-/api/entries", "POST");
    await $("#add-btn").click();
    await $("#entry-name").setValue("Saved while read-only");
    await $("#place-btn").click();
    await $(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
    await $("#entry-submit-btn").click();

    await expect($("#entry-overlay")).not.toBeDisplayed();
    await expect($("#sections")).toHaveTextContent(expect.stringContaining("Saved while read-only"));
    await expect($("#sync-line-text")).toHaveTextContent("1 change waiting to sync");

    await writes.restore();
    await syncAndWait();
    expect(await savedNames(owner)).toContain("Saved while read-only");
  });

  it("in read-only mode a climb deleted online is queued, then deleted once writes are back (#1063)", async () => {
    const owner = await claimOwner();
    await owner.seed({ entries: [{ id: "gone", name: "Delete me" }] });
    await gotoSyncedLog(owner);

    const writes = await refuseWrites("**/-/api/entries", "DELETE");
    await $("#collapse-all-btn").click();
    await $("//tr[.//*[normalize-space(text())='Delete me']]//*[contains(@class,'edit-btn')]").click();
    browser.once("dialog", dialog => dialog.accept());
    await $("#entry-delete-btn").click();
    await expect($("#sync-line-text")).toHaveTextContent("1 change waiting to sync");

    await writes.restore();
    await syncAndWait();
    expect(await savedNames(owner)).not.toContain("Delete me");
  });

  it("security.txt is served on the apex and my. hosts (#1063)", async () => {
    for (const origin of ["http://localhost:8787", OWNED_ORIGIN]) {
      const res = await fetch(`${origin}/.well-known/security.txt`);
      expect({ origin, status: res.status }).toEqual({ origin, status: 200 });
      expect(await res.text()).toContain(
        "Contact: https://github.com/ravendarque/climbing-logbook/security/advisories/new",
      );
    }
  });
});
