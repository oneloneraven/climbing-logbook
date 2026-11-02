import { browser, expect } from "@wdio/globals";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

describe("logout", () => {
  it("keeps an unsynced queue attributed to its owner and forgets who's signed in", async () => {
    const owner = await claimOwner();
    await gotoSyncedLog(owner);
    const queueKey = `logbook_pending_queue:${owner.username}`;
    await browser.execute(
      key => localStorage.setItem(key, JSON.stringify([{ kind: "entry", op: "delete", record: { id: "queued-1" } }])),
      queueKey,
    );

    await $("#header-menu-btn").click();
    await $("#login-toggle-btn").click();
    await browser.waitUntil(async () => new URL(await browser.getUrl()).pathname === "/-/login/");
    await expect($("#login-form")).toBeDisplayed();

    const stored = await browser.execute(
      key => [localStorage.getItem("logbook_signed_in_user"), localStorage.getItem(key)],
      queueKey,
    );
    expect(stored[0]).toBeNull();
    expect(JSON.parse(stored[1])).toHaveLength(1);
  });
});
