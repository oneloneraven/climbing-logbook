import { $, $$, browser, expect } from "@wdio/globals";
import { d1Execute } from "../scripts/lib/dev-session.mjs";
import { boundingBox, browserFetch, expectEventually, tap, waitForResource, waitForUrl } from "./wdio-browser.js";
import { claimOwner } from "./wdio-owner.js";

const ADMIN = "http://admin.localhost:8787";

function seed(table, rows) {
  const values = rows
    .map(({ id, message, section = null, contactEmail = null, sourcePage = null }) =>
      [id, message, section, contactEmail, sourcePage].map(v => (v === null ? "NULL" : `'${v}'`)).join(", "),
    )
    .map(row => `(${row}, datetime('now'))`)
    .join(", ");
  d1Execute(`INSERT INTO ${table} (id, message, section, contact_email, source_page, created_at) VALUES ${values}`, {
    database: "climbing-logbook-preview",
    env: "preview",
  });
}

const card = message => $("#submission-list").$(`a*=${message}`);
const unreadCount = tab => $(`#tab-${tab} [data-unread]`);

const activityFor = username =>
  browser.execute(
    name =>
      [...document.querySelectorAll("#activity-list li")]
        .map(li => li.textContent.replace(/\s+/g, " ").trim())
        .filter(text => text.includes(name)),
    username,
  );

describe("admin on a phone", () => {
  beforeEach(() => browser.setViewport({ width: 312, height: 680 }));

  it("a report is read by opening it, then archived, restored and deleted", async () => {
    const id = `e2e-admin-${Date.now()}`;
    const message = `Duplicate entry after syncing ${id}`;
    seed("issue_reports", [
      { id, message, section: "logbook", contactEmail: "climber@example.com", sourcePage: "/ellie/log" },
    ]);

    await browser.url(`${ADMIN}/`);
    await waitForUrl(url => url.href === `${ADMIN}/reports`);
    await expect($("#tab-reports")).toHaveAttribute("aria-current", "page");
    await expect(card(message)).toHaveTextContent(expect.stringContaining("Unread"));
    const before = Number(await unreadCount("reports").getProperty("textContent"));

    await tap(card(message));
    await expect(browser).toHaveUrl(`${ADMIN}/reports?id=${id}`);
    await expect($("#list-pane")).not.toBeDisplayed();
    await expect($("#detail-message")).toHaveTextContent(message);
    await expect($("#detail-fields")).toHaveTextContent(expect.stringContaining("Logbook"));
    await expect($("#detail-fields")).toHaveTextContent(expect.stringContaining("/ellie/log"));
    await expect($("#detail-fields")).toHaveTextContent(expect.stringContaining("Not signed in"));
    await expect($("#detail-fields a")).toHaveAttribute("href", "mailto:climber@example.com");
    await expect($("#toggle-read")).toHaveTextContent("Mark as unread");
    await expect(unreadCount("reports")).toHaveTextContent(before - 1 ? String(before - 1) : "");

    await tap($("#detail-back"));
    await expect(card(message)).toBeDisplayed();
    await expect(card(message)).not.toHaveTextContent(expect.stringContaining("Unread"));

    await tap(card(message));
    await tap($("#toggle-archived"));
    await expect(browser).toHaveUrl(`${ADMIN}/reports`);
    await expect(card(message)).not.toExist();

    await tap($("#show-archived"));
    await tap(card(message));
    await expect($("#toggle-archived")).toHaveTextContent("Unarchive");
    await tap($("#toggle-archived"));
    await expect(card(message)).not.toExist();
    await tap($("#show-active"));
    await tap(card(message));

    await tap($("#delete-btn"));
    const dialog = $("#delete-dialog");
    await expect(dialog).toHaveTextContent(expect.stringContaining("Delete this report?"));
    await tap(dialog.$('role/button[name="Cancel"]'));
    await expect($("#detail-message")).toHaveTextContent(message);

    await tap($("#delete-btn"));
    await tap(dialog.$('role/button[name="Delete"]'));
    await expect(browser).toHaveUrl(`${ADMIN}/reports`);
    await expect(card(message)).not.toExist();
    await browser.refresh();
    await waitForResource("/-/api/admin/reports");
    await expect(card(message)).not.toExist();
  });

  it("Mark as unread goes back to the list with it unread again", async () => {
    const id = `e2e-admin-unread-${Date.now()}`;
    const message = `Please add trad ${id}`;
    seed("feedback_submissions", [{ id, message }]);

    await browser.url(`${ADMIN}/feedback?id=${id}`);
    await expect($("#detail-message")).toHaveTextContent(message);
    await expect($("#detail-fields")).toHaveTextContent(expect.stringContaining("Not set"));
    await expect($("#detail-fields")).toHaveTextContent(expect.stringContaining("None given"));
    await expect($("#toggle-read")).toHaveTextContent("Mark as unread");
    await tap($("#toggle-read"));

    await expect(browser).toHaveUrl(`${ADMIN}/feedback`);
    await expect(card(message)).toHaveTextContent(expect.stringContaining("Unread"));
  });
});

describe("admin", () => {
  it("dismissing the delete question with Escape keeps the submission, even after an earlier delete", async () => {
    const stamp = Date.now();
    seed("issue_reports", [
      { id: `e2e-admin-gone-${stamp}`, message: `Delete me ${stamp}` },
      { id: `e2e-admin-kept-${stamp}`, message: `Keep me ${stamp}` },
    ]);

    await browser.url(`${ADMIN}/reports?id=e2e-admin-gone-${stamp}`);
    await $("#delete-btn").click();
    await $("#delete-dialog").$('role/button[name="Delete"]').click();
    await expect(card(`Delete me ${stamp}`)).not.toExist();

    await card(`Keep me ${stamp}`).click();
    await $("#delete-btn").click();
    await expect($("#delete-dialog")).toBeDisplayed();
    // Escape keeps the old returnValue in some browsers, so the dialog must open without one.
    expect(await browser.execute(() => document.getElementById("delete-dialog").returnValue)).toBe("");
    await browser.keys("Escape");
    await expect($("#delete-dialog")).not.toBeDisplayed();
    await browser.refresh();
    await expect($("#detail-message")).toHaveTextContent(`Keep me ${stamp}`);
  });

  it("wide: the list and the opened submission sit side by side", async () => {
    const id = `e2e-admin-wide-${Date.now()}`;
    const message = `Loving the gap report ${id}`;
    seed("feedback_submissions", [{ id, message, section: "performance" }]);

    await browser.url(`${ADMIN}/feedback`);
    await card(message).click();
    await expect($("#list-pane")).toBeDisplayed();
    await expect($("#detail-pane")).toBeDisplayed();
    await expect($("#detail-back")).not.toBeDisplayed();
    await expect(card(message)).toHaveAttribute("aria-current", "true");

    const list = await boundingBox($("#list-pane"));
    const detail = await boundingBox($("#detail-pane"));
    expect(detail.x).toBeGreaterThan(list.x + list.width);
  });

  it("the admin pages and API don't exist on the app's own hosts", async () => {
    for (const url of [
      "http://my.localhost:8787/-/api/admin/reports",
      "http://localhost:8787/-/api/admin/counts",
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

  it("a user is found, suspended, unsuspended and deleted, and each step is in the activity log", async () => {
    const owner = await claimOwner();
    await browser.setViewport({ width: 312, height: 680 });
    const ownSettings = () => browserFetch("http://my.localhost:8787/-/api/settings");
    expect((await ownSettings()).status).toBe(200);

    await browser.url(`${ADMIN}/users`);
    await expect($("#tab-users")).toHaveAttribute("aria-current", "page");
    await $("#user-search").setValue(owner.username);
    const row = $("#user-list").$(`a*=${owner.username}`);
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
    await $("#user-search").setValue(owner.username);
    await $("#user-list").$(`a*=${owner.username}`).click();
    await expect($$("#logbook-list li")).toBeElementsArrayOfSize(0);

    await $("#view-logbook").click();
    await expect($("#logbook-status")).toHaveTextContent("1 climb");
    const climb = $("#logbook-list li");
    await expect(climb).toHaveTextContent(expect.stringContaining("Quiet project"));
    await expect(climb).toHaveTextContent(expect.stringContaining("Project"));
    await expect(climb).toHaveTextContent(expect.stringContaining("Just for me"));
    await expect(climb).toHaveTextContent(expect.stringContaining("Pain or injury: left hand crimp static overhang"));
    await expect(climb.$$("button, input, a")).toBeElementsArrayOfSize(0);

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
