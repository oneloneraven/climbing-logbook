import { $, $$, browser, expect } from "@wdio/globals";
import { boundingBox, browserFetch, expectEventually, waitForUrl } from "./wdio-browser.js";
import { claimOwner } from "./wdio-owner.js";

const ADMIN = "http://admin.localhost:8787";

async function findUser(username) {
  await $("#user-search").setValue(username);
  // Picked before the search applies, the row moves as the full list collapses to the match.
  await expect($$("#user-list li")).toBeElementsArrayOfSize(1);
  return $("#user-list").$(`a*=${username}`);
}

const activityFor = username =>
  browser.execute(
    name =>
      [...document.querySelectorAll("#activity-list li")]
        .map(li => li.textContent.replace(/\s+/g, " ").trim())
        .filter(text => text.includes(name)),
    username,
  );

describe("admin", () => {
  it("opens on Users, with the list and the opened user side by side when wide (#1712)", async () => {
    const owner = await claimOwner();
    await browser.url(`${ADMIN}/`);
    await waitForUrl(url => url.href === `${ADMIN}/users`);
    await expect($("#tab-users")).toHaveAttribute("aria-current", "page");
    const tabs = $('nav[aria-label="Admin"]');
    await expect(tabs.$('role/link[name="Reports"]')).not.toExist();
    await expect(tabs.$('role/link[name="Feedback"]')).not.toExist();

    await (await findUser(owner.username)).click();
    await expect($("#user-list-pane")).toBeDisplayed();
    await expect($("#user-detail")).toBeDisplayed();
    await expect($("#user-back")).not.toBeDisplayed();

    const list = await boundingBox($("#user-list-pane"));
    const detail = await boundingBox($("#user-detail"));
    expect(detail.x).toBeGreaterThan(list.x + list.width);
  });

  it("the admin pages and API don't exist on the app's own hosts", async () => {
    for (const url of [
      "http://my.localhost:8787/-/api/admin/users",
      "http://localhost:8787/-/api/admin/audit",
      "http://localhost:8787/admin/",
      "http://my.localhost:8787/-/admin-app.js",
    ]) {
      expect({ url, status: (await fetch(url)).status }).toEqual({ url, status: 404 });
    }
    expect((await fetch("http://localhost:8787/")).status).toBe(200);
  });

  it("the user list labels a demo account as internal (#1519)", async () => {
    await browser.url(`${ADMIN}/users`);
    await $("#user-search").setValue("advanceddemo");
    const row = $("#user-list").$("a*=advanceddemo");
    await expect(row).toBeExisting();
    const labels = () =>
      browser.execute(() =>
        [...document.querySelectorAll("#user-list a")]
          .filter(a => a.textContent.includes("advanceddemo"))
          .map(a => {
            const exactly = text => [...a.querySelectorAll("*")].filter(el => el.textContent.trim() === text);
            return { internal: exactly("Internal").some(el => el.checkVisibility()), demo: exactly("Demo").length };
          }),
      );
    await expectEventually(labels, [{ internal: true, demo: 0 }]);
  });

  it("a demo account's logbook offers no way to hide its climbs (#1712)", async () => {
    await browser.url(`${ADMIN}/users`);
    await (await findUser("advanceddemo")).click();
    await $("#view-logbook").click();
    await expect($("#logbook-status")).toHaveTextContent(expect.stringMatching(/\d+ climbs?/));
    await expect($$("#logbook-list li")).not.toBeElementsArrayOfSize(0);
    await expect($$("#logbook-list button")).toBeElementsArrayOfSize(0);
  });

  it("a user is found, suspended, unsuspended and deleted, and each step is in the activity log", async () => {
    const owner = await claimOwner();
    await browser.setViewport({ width: 312, height: 680 });
    const ownSettings = () => browserFetch("http://my.localhost:8787/-/api/settings");
    expect((await ownSettings()).status).toBe(200);

    await browser.url(`${ADMIN}/users`);
    await expect($("#tab-users")).toHaveAttribute("aria-current", "page");
    const row = await findUser(owner.username);
    await expect(row).toHaveTextContent(expect.stringContaining(owner.email));
    await row.click();

    await expect($("#user-heading")).toHaveTextContent(owner.username);
    await expect($("#user-fields")).toHaveTextContent(expect.stringContaining("Active"));
    await $("#toggle-suspend").click();
    await expect($("#user-fields")).toHaveTextContent(expect.stringContaining("Suspended"));
    await expect($("#toggle-suspend")).toHaveTextContent("Unsuspend");
    expect((await ownSettings()).status).toBe(401);

    await $("#toggle-suspend").click();
    await expect($("#user-fields")).toHaveTextContent(expect.stringContaining("Active"));

    await $("#user-delete").click();
    const dialog = $("#user-dialog");
    await expect(dialog).toHaveTextContent(expect.stringContaining(`Delete ${owner.username}?`));
    const confirm = dialog.$("#user-dialog-confirm");
    const confirmation = dialog.$('role/textbox[name="Type their username to confirm"]');
    await expect(confirm).toBeDisabled();
    await confirmation.setValue("not-them");
    await expect(confirm).toBeDisabled();
    await confirmation.setValue(owner.username);
    await confirm.click();
    await expect(browser).toHaveUrl(expect.stringContaining(`${ADMIN}/users`));
    await expect(row).not.toExist();

    await $("#tab-activity").click();
    await expectEventually(
      () => activityFor(owner.username),
      [
        expect.stringMatching(new RegExp(`Deleted ${owner.username}`)),
        expect.stringMatching(new RegExp(`Unsuspended ${owner.username}`)),
        expect.stringMatching(new RegExp(`Suspended ${owner.username}`)),
      ],
    );
  });

  it("a private logbook can be viewed read-only, health data included, and the view is in the activity log (#1279, #1433)", async () => {
    const owner = await claimOwner();
    await owner.settings({ logbookPublic: false });
    await owner.grantPainInjuryConsent();
    await owner.seed({
      entries: [
        {
          name: "Quiet project",
          status: "project",
          notes: "Just for me",
          painMoves: [
            { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" },
          ],
        },
      ],
    });

    await browser.url(`${ADMIN}/users`);
    await (await findUser(owner.username)).click();
    await expect($$("#logbook-list li")).toBeElementsArrayOfSize(0);

    await $("#view-logbook").click();
    await expect($("#logbook-status")).toHaveTextContent("1 climb");
    const climb = $("#logbook-list li");
    await expect(climb).toHaveTextContent(expect.stringContaining("Quiet project"));
    await expect(climb).toHaveTextContent(expect.stringContaining("Project"));
    await expect(climb).toHaveTextContent(expect.stringContaining("Just for me"));
    await expect(climb).toHaveTextContent(expect.stringContaining("Pain or injury: left hand crimp static overhang"));
    await expect(climb.$$("input, a")).toBeElementsArrayOfSize(0);
    await expect(climb.$$("button")).toBeElementsArrayOfSize(1);
    await expect(climb.$('role/button[name="Hide this entry"]')).toBeDisplayed();

    await $("#toggle-suspend").click();
    await expect($("#user-fields")).toHaveTextContent(expect.stringContaining("Suspended"));
    await expect(climb).toHaveTextContent(expect.stringContaining("Quiet project"));
    await $("#toggle-suspend").click();

    await $("#tab-activity").click();
    await expectEventually(
      () => activityFor(owner.username),
      [
        expect.stringMatching(new RegExp(`Unsuspended ${owner.username}`)),
        expect.stringMatching(new RegExp(`Suspended ${owner.username}`)),
        expect.stringMatching(new RegExp(`Viewed ${owner.username}'s logbook`)),
      ],
    );
  });

  it("the usage tab shows the headline figures, the splits, and places by country that open to their locations", async () => {
    await browser.setViewport({ width: 312, height: 680 });
    await browser.url(`${ADMIN}/usage`);
    await expect($("#tab-usage")).toHaveAttribute("aria-current", "page");
    await expect($("#usage-view")).toHaveTextContent(expect.stringContaining("the demo accounts aren't counted"));

    await expect($$("#usage-tiles > div")).toBeElementsArrayOfSize(4);
    await expect($$("#usage-tiles > div")[0]).toHaveTextContent(expect.stringContaining("Users"));
    await expect($$("#usage-tiles > div")[1]).toHaveTextContent(expect.stringContaining("Climbs"));
    await expect($("#usage-people")).toHaveTextContent(expect.stringContaining("Athlete Mode on"));
    await expect($("#usage-people")).toHaveTextContent(expect.stringContaining("Counted from"));
    await expect($("#usage-statuses")).toHaveTextContent(expect.stringContaining("Send / Redpoint"));
    await expect($("#usage-disciplines")).toHaveTextContent(expect.stringContaining("Boulder"));

    const firstCountry = $$("#usage-countries button")[0];
    const firstLocation = $$("#usage-countries tr[data-country='0']")[0];
    await expect(firstLocation).not.toBeDisplayed();
    await firstCountry.click();
    await expect(firstCountry).toHaveAttribute("aria-expanded", "true");
    await expect(firstLocation).toBeDisplayed();
    expect(await browser.execute(() => document.documentElement.scrollWidth)).toBe(312);
  });

  it("an invite is created, tied to an email address, and listed with its code", async () => {
    const email = `invite-${Date.now()}@example.com`;
    await browser.url(`${ADMIN}/invites`);
    await expect($("#tab-invites")).toHaveAttribute("aria-current", "page");
    await $("#invite-email").setValue(email);
    await $("#invite-create").click();

    await expect($("#invites-status")).toHaveTextContent("Invite created. Copy its link to send it.");
    const row = $("#invites-list").$(`li*=${email}`);
    await expect(row).toHaveTextContent(expect.stringContaining("Unused"));
    await expect(row.$("button*=Copy link")).toBeDisplayed();
  });
});
