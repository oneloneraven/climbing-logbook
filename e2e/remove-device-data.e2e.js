import { $, $$, browser, expect } from "@wdio/globals";
import { entriesDatabase, readCachedEntries } from "./entries-cache.js";
import { boundingBox, currentPath, openTab, waitForPath } from "./wdio-browser.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

const SEED = { entries: [{ type: "boulder", name: "Boulder Seed" }] };
const QUEUED = JSON.stringify([
  { kind: "entry", op: "delete", record: { id: "queued-1" }, qid: "q1" },
  { kind: "entry", op: "delete", record: { id: "queued-2" }, qid: "q2" },
]);

const userKeys = owner =>
  browser.execute(suffix => Object.keys(localStorage).filter(key => key.endsWith(suffix)), `:${owner.username}`);
const cachedEntries = owner => browser.execute(readCachedEntries, entriesDatabase(owner.username));
const contains = text => expect.stringContaining(text);

async function openAccountPage({ queue = null } = {}) {
  const owner = await claimOwner();
  await owner.seed(SEED);
  await gotoSyncedLog(owner);
  await browser.execute(
    (queueKey, queue) => {
      localStorage.setItem("logbook_theme", "light");
      if (queue) localStorage.setItem(queueKey, queue);
    },
    `logbook_pending_queue:${owner.username}`,
    queue,
  );
  await browser.url(owner.url("/account"));
  await expect($("#remove-data-row")).toBeDisplayed();
  return owner;
}

describe("remove device data", () => {
  it("Clear device data takes the logbook off the device and logs out, keeping device-level choices", async () => {
    const owner = await openAccountPage();
    expect(await cachedEntries(owner)).toHaveLength(1);
    expect((await userKeys(owner)).length).toBeGreaterThan(0);
    await expect($("#remove-data-row .row-card-title")).toHaveTextContent("Clear my data from this device");
    await expect($("#remove-data-description")).toHaveTextContent(contains("Nothing is deleted from your account"));
    await expect($("#remove-data-description")).toHaveTextContent(contains("syncs back the next time you log in here"));
    await expect($("#remove-data-warning")).not.toBeDisplayed();
    await expect($$("#remove-data-row button")).toBeElementsArrayOfSize(1);

    await $('role/button[name="Clear device data"]').click();
    await waitForPath("/-/login/");

    expect(await userKeys(owner)).toEqual([]);
    expect(await cachedEntries(owner)).toBeNull();
    const databases = (await browser.execute(() => indexedDB.databases())).map(db => db.name);
    expect(databases).not.toContain(entriesDatabase(owner.username));
    expect(await browser.execute(() => localStorage.getItem("logbook_theme"))).toBe("light");
    expect(await browser.execute(() => localStorage.getItem("logbook_signed_in_user"))).toBeNull();
  });

  it("changes that haven't synced are warned about above the button, which then clears in one click", async () => {
    const owner = await openAccountPage({ queue: QUEUED });

    await expect($("#remove-data-warning")).toBeDisplayed();
    await expect($("#remove-data-warning-text")).toHaveTextContent(
      "2 changes haven't synced yet. If you clear your data now, they will be lost.",
    );
    await expect($("#remove-data-log-link")).toHaveAttribute("href", `/${owner.username}/log`);
    const [description, warning, button] = await Promise.all(
      ["#remove-data-description", "#remove-data-warning", "#remove-data-btn"].map(selector =>
        boundingBox($(selector)),
      ),
    );
    expect(warning.y).toBeGreaterThan(description.y + description.height - 1);
    expect(button.y).toBeGreaterThan(warning.y + warning.height - 1);

    await $("#remove-data-btn").click();
    await waitForPath("/-/login/");
    expect(await userKeys(owner)).toEqual([]);
  });

  it("the warning follows changes queued in another tab while the page is open", async () => {
    const owner = await openAccountPage();
    await expect($("#remove-data-warning")).not.toBeDisplayed();
    const queueKey = `logbook_pending_queue:${owner.username}`;

    const otherTab = await openTab(owner.url("/account"));
    await otherTab.execute((key, queue) => localStorage.setItem(key, queue), queueKey, QUEUED);
    await expect($("#remove-data-warning")).toBeDisplayed();

    await otherTab.execute(key => localStorage.removeItem(key), queueKey);
    await expect($("#remove-data-warning")).not.toBeDisplayed();
  });

  it("if logging out fails, nothing is cleared and the page says why", async () => {
    const owner = await openAccountPage();
    const signOut = await browser.mock("**/-/api/auth/sign-out");
    signOut.abort();

    await $("#remove-data-btn").click();

    await expect($("#remove-data-error")).toHaveTextContent(contains("Couldn't log you out, so nothing was cleared"));
    await expect($("#remove-data-btn")).toBeEnabled();
    expect((await userKeys(owner)).length).toBeGreaterThan(0);
    expect(await cachedEntries(owner)).toHaveLength(1);
    expect(await currentPath()).toBe(`/${owner.username}/account`);
  });

  it("if some data can't be cleared after logging out, the page still says so", async () => {
    const owner = await openAccountPage();
    await browser.execute(() => {
      IDBFactory.prototype.deleteDatabase = () => {
        throw new DOMException("denied", "SecurityError");
      };
    });

    await $("#remove-data-btn").click();

    await expect($("#remove-data-error")).toBeDisplayed();
    await expect($("#remove-data-error")).toHaveTextContent(
      contains("clear this site's data in your browser's settings"),
    );
    expect(await currentPath()).toBe(`/${owner.username}/account`);
  });
});
