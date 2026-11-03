import { $, browser, expect } from "@wdio/globals";
import { currentPath, goOffline, recordFetches, waitForPath } from "./wdio-browser.js";
import { claimOwner } from "./wdio-owner.js";

const contains = text => expect.stringContaining(text);
const joinButton = () => $('role/button[name="Join Check our beta"]');

async function expectSavedOnClick(fetches, button, body) {
  const patch = fetches.next("/-/api/settings", "PATCH");
  await button.click();
  expect(JSON.parse((await patch).body)).toEqual(body);
}

describe("account beta page", () => {
  it("not enrolled: explains joining, and Join writes the setting and opens the beta's log", async () => {
    const owner = await claimOwner();
    const fetches = await recordFetches();
    await browser.url(owner.url("/account/beta"));

    await expect($("//*[self::h1 or self::h2 or self::h3][normalize-space()='Check our beta']")).toBeDisplayed();
    await expect($("#beta-status")).toHaveTextContent("You're not enrolled in Check our beta.");
    await expect($("#beta-join")).toHaveTextContent(contains("uses the same logbook as the Main Channel"));
    await expect($("#beta-leave")).not.toBeDisplayed();
    await expect($("#beta-queue-warning")).not.toBeDisplayed();

    await expectSavedOnClick(fetches, joinButton(), { betaOptIn: true });
    await waitForPath(`/${owner.username}/log`);
  });

  it("enrolled: explains leaving, and Leave writes the setting and opens the Main Channel's log", async () => {
    const owner = await claimOwner();
    await owner.settings({ betaOptIn: true });
    const fetches = await recordFetches();
    await browser.url(owner.url("/account/beta"));

    await expect($("#beta-status")).toHaveTextContent("You're enrolled in Check our beta.");
    await expect($("#beta-leave")).toHaveTextContent(contains("Logbook Beta PWA will say you're not enrolled"));
    await expect($("#beta-join")).not.toBeDisplayed();

    await expectSavedOnClick(fetches, $('role/button[name="Leave Check our beta"]'), { betaOptIn: false });
    await waitForPath(`/${owner.username}/log`);
  });

  it("offline: the button is disabled with a note, and comes back with the connection", async () => {
    const owner = await claimOwner();
    await browser.url(owner.url("/account/beta"));
    await expect(joinButton()).toBeEnabled();

    const backOnline = await goOffline();
    await expect(joinButton()).toBeDisabled();
    await expect($("#beta-offline-note")).toBeDisplayed();

    await backOnline();
    await expect(joinButton()).toBeEnabled();
    await expect($("#beta-offline-note")).not.toBeDisplayed();
  });

  it("changes waiting to sync on this device are pointed out, without blocking", async () => {
    const owner = await claimOwner();
    await browser.addInitScript(username => {
      localStorage.setItem("logbook_signed_in_user", username);
      localStorage.setItem(
        `logbook_pending_queue:${username}`,
        JSON.stringify([
          { kind: "entry", op: "add", record: { id: "a" } },
          { kind: "entry", op: "add", record: { id: "b" } },
        ]),
      );
    }, owner.username);
    await browser.url(owner.url("/account/beta"));

    await expect($("#beta-queue-count")).toHaveTextContent("You have 2 changes waiting to sync on this device.");
    await expect($("#beta-queue-warning")).toHaveTextContent(
      contains("Other devices you've used offline need to sync on their own."),
    );
    await expect(joinButton()).toBeEnabled();
  });

  it("a failed save shows the error, focused, and stays on the page", async () => {
    const owner = await claimOwner();
    const settings = await browser.mock("**/-/api/settings", { method: "PATCH" });
    settings.respond({}, { statusCode: 500, fetchResponse: false });
    await browser.url(owner.url("/account/beta"));
    const before = await currentPath();

    await joinButton().click();
    const error = $("#beta-error");
    await expect(error).toHaveTextContent("Couldn't join Check our beta (error 500). Try again.");
    await expect(error).toBeFocused();
    await expect(joinButton()).toBeEnabled();
    expect(await currentPath()).toBe(before);
  });

  it("links to the full help page and back to My Account", async () => {
    const owner = await claimOwner();
    await browser.url(owner.url("/account/beta"));
    await expect($('role/link[name="Read more about Check our beta"]')).toHaveAttribute("href", "/help/beta-channel/");
    await expect($("#back-to-account-link")).toHaveAttribute("href", `/${owner.username}/account`);
  });
});
