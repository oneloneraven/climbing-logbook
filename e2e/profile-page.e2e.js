import { $, $$, browser, expect } from "@wdio/globals";
import { clearCookies, expectEventually, resourceUrls, textContents } from "./wdio-browser.js";
import { holdRequests } from "./wdio-hold.js";
import { claimOwner } from "./wdio-owner.js";

const SEED = { entries: [{ name: "Boulder Seed" }] };
const MIXED_SEED = {
  entries: [
    { firstAttempt: true, name: "Boulder Seed" },
    { type: "sport", grade: "6a", name: "Sport Seed" },
  ],
};
const contains = text => expect.stringContaining(text);
const exactText = text => $(`//*[normalize-space(text())=${JSON.stringify(text)}]`);
const sections = () => $("#sections");
const placeHeaders = () => $$(".place-header");
const BOTH_HEADERS = [expect.stringMatching(/Test Crag \(Boulder\)/), expect.stringMatching(/Test Crag \(Sport\)/)];

async function visitProfile(seed) {
  const owner = await claimOwner();
  if (seed) await owner.seed(seed);
  await clearCookies();
  await browser.url(owner.url(""));
  if (seed) await expect(placeHeaders()[0]).toBeDisplayed();
  return owner;
}

const publicEntryRequests = () => browser.mock("**/-/api/public/*/entries");

describe("public profile page", () => {
  it("renders the shared chrome readonly -- no edit affordances or admin rows anywhere", async () => {
    await visitProfile(SEED);

    await expect($("climbing-header [data-brand-name]")).toHaveTextContent("Climbing Logbook");
    await expect($("climbing-entries-table")).toBeDisplayed();

    for (const selector of ["#add-btn", "#sync-line", ".edit-btn", "#entry-overlay", "#add-place-overlay"]) {
      await expect($(selector)).not.toExist();
    }

    await $("#header-menu-btn").click();
    await expect($("#login-toggle-btn")).not.toExist();
    await expect($("#athlete-mode-btn")).not.toExist();
    await expect($("#theme-toggle-btn")).toBeDisplayed();
  });

  it("has no Grade Pyramid: no <climbing-tab-bar>, no pyramid markup, no performance bundle request", async () => {
    await visitProfile(SEED);
    await expect($("climbing-entries-table")).toBeDisplayed();

    await expect($("climbing-tab-bar")).not.toExist();
    await expect($("climbing-grade-pyramid")).not.toExist();
    expect(
      (await resourceUrls()).some(
        url => url.includes("performance-pyramid-app.js") || url.includes("performance-hub-app.js"),
      ),
    ).toBe(false);
  });

  it("Map tab (#333) switches to a real read-only map and back, without a page navigation", async () => {
    await visitProfile(SEED);
    await expect($("climbing-entries-table")).toBeDisplayed();

    await expect($("#panel-map")).not.toBeDisplayed();
    await $('#view-tabs [data-view="map"]').click();

    await expect($("#panel-logbook")).not.toBeDisplayed();
    await expect($('#view-tabs [data-view="map"]')).toHaveAttribute("aria-selected", "true");
    await expect($("#map-svg")).toBeDisplayed();
    await expect($("#map-load-retry")).not.toExist();
    await expect($("#subtitle")).not.toHaveTextContent("");

    await $('#view-tabs [data-view="logbook"]').click();
    await expect($("#panel-map")).not.toBeDisplayed();
    await expect($("climbing-entries-table")).toBeDisplayed();
  });

  it("has no discipline picker: the combined view shows both disciplines as separate table sections", async () => {
    await visitProfile(MIXED_SEED);
    await expect($("climbing-entries-table")).toBeDisplayed();

    await expect($("#discipline-btn")).not.toExist();

    await $("#collapse-all-btn").click();

    for (const text of ["Test Crag (Boulder)", "Test Crag (Sport)", "Boulder Seed", "Sport Seed"]) {
      await expect(sections()).toHaveTextContent(contains(text));
    }
  });

  it("discipline filter (#460) narrows to just the checked discipline's table section", async () => {
    await visitProfile(MIXED_SEED);
    await expect($("climbing-entries-table")).toBeDisplayed();

    await $("#collapse-all-btn").click();
    await expect(sections()).toHaveTextContent(contains("Sport Seed"));

    await $("#filter-btn").click();
    await $('#filter-discipline-group label:has(input[data-discipline="boulder"])').click();

    await expect(sections()).toHaveTextContent(contains("Sport Seed"));
    await expect(sections()).not.toHaveTextContent(contains("Boulder Seed"));
    await expect(sections()).not.toHaveTextContent(contains("Test Crag (Boulder)"));
  });

  it("Style filter is hidden until Sport is in view, and narrows the combined table", async () => {
    await visitProfile({
      entries: [...MIXED_SEED.entries, { type: "sport", grade: "6b", name: "Top Rope Seed", sportStyle: "top_rope" }],
    });
    await expect($("climbing-entries-table")).toBeDisplayed();

    await $("#collapse-all-btn").click();
    await expect(sections()).toHaveTextContent(contains("Sport Seed"));
    await expect(sections()).toHaveTextContent(contains("Top Rope Seed"));

    await $("#filter-btn").click();
    await expect($("#filter-sport-style-wrap")).toBeDisplayed();
    await expect($('#filter-sport-style-group input[data-sport-style="lead"]')).toBeSelected();
    await expect($('#filter-sport-style-group input[data-sport-style="top_rope"]')).toBeSelected();

    await $('#filter-sport-style-group label:has(input[data-sport-style="top_rope"])').click();
    await expect(sections()).toHaveTextContent(contains("Sport Seed"));
    await expect(sections()).not.toHaveTextContent(contains("Top Rope Seed"));
    await expect(sections()).toHaveTextContent(contains("Boulder Seed"));

    await $('#filter-discipline-group label:has(input[data-discipline="sport"])').click();
    await expect($("#filter-sport-style-wrap")).not.toBeDisplayed();

    await $("#filter-clear-btn").click();
    await expect(sections()).toHaveTextContent(contains("Top Rope Seed"));
  });

  it("combined status filter labels span both disciplines, and there's no grade-tier filter", async () => {
    await visitProfile(MIXED_SEED);
    await expect($("climbing-entries-table")).toBeDisplayed();

    await $("#filter-btn").click();
    await expect($("#filter-flash-label")).toHaveTextContent("Flash / Onsight");
    await expect($("#filter-send-label")).toHaveTextContent("Send / Redpoint");
    await expect($("#filter-grade-tier-group")).not.toExist();
  });

  it("filter panel status icons render real SVG content, without the entry form (#63)", async () => {
    await visitProfile(MIXED_SEED);
    await expect($("climbing-entries-table")).toBeDisplayed();

    await $("#filter-btn").click();
    for (const status of ["flash", "send", "project", "checkout", "archived"]) {
      await expect($(`#filter-status-group [data-icon="${status}"] svg`)).toBeDisplayed();
    }
  });

  it("map pin popover (#460) shows both disciplines' own status breakdown together", async () => {
    await visitProfile(MIXED_SEED);
    await $('#view-tabs [data-view="map"]').click();
    await expect($("#map-svg")).toBeDisplayed();

    await $('[data-pin-country="United Kingdom"]').click();
    const popover = $("#map-pin-popover");
    await expect(popover).toBeDisplayed();
    for (const text of ["Boulder", "Sport", "Flash", "Send"]) await expect(popover).toHaveTextContent(contains(text));
  });

  it("notes overlay shows the entry's real notes text (#425)", async () => {
    await visitProfile({ entries: [{ name: "Boulder Seed", notes: "A real note to display" }] });
    await expect($("climbing-entries-table")).toBeDisplayed();

    await $("#collapse-all-btn").click();
    await $$(".notes-btn")[0].click();
    await expect($("#notes-overlay")).toBeDisplayed();
    await expect($("#notes-modal-text")).toHaveTextContent("A real note to display");

    await browser.keys("Escape");
    await expect($("#notes-overlay")).not.toBeDisplayed();
  });

  it("shell-then-expand: collapsed with a count badge by default, expands to real rows on one fetch, doesn't re-fetch on re-expand", async () => {
    const owner = await claimOwner();
    await owner.seed(SEED);
    await clearCookies();
    const entriesRequests = await publicEntryRequests();

    await browser.url(owner.url(""));
    await expect($("climbing-entries-table")).toBeDisplayed();

    await expect(sections()).toHaveTextContent(contains("Test Crag"));
    await expect(sections()).not.toHaveTextContent(contains("Boulder Seed"));
    expect(entriesRequests.calls).toHaveLength(0);

    const placeHeader = placeHeaders()[0];
    await placeHeader.click();

    await expect(sections()).toHaveTextContent(contains("Boulder Seed"));
    expect(entriesRequests.calls).toHaveLength(1);
    expect(entriesRequests.calls[0].request.url).toContain(`locationId=${owner.ownId("l1")}`);

    await placeHeader.click();
    await expect(exactText("Boulder Seed")).not.toBeDisplayed();
    await placeHeader.click();
    await expect(exactText("Boulder Seed")).toBeDisplayed();
    expect(entriesRequests.calls).toHaveLength(1);
  });

  it("collapsed headers already name their discipline, and keep the same name once their rows load (#1487)", async () => {
    await visitProfile(MIXED_SEED);
    await expectEventually(() => textContents(".place-header"), BOTH_HEADERS);

    await placeHeaders()[0].click();
    await expect(sections()).toHaveTextContent(contains("Boulder Seed"));
    await expectEventually(() => textContents(".place-header"), BOTH_HEADERS);
    await expect(exactText("Sport Seed")).not.toBeDisplayed();
  });

  it("expanding one discipline's table loads only that table, and the other's header stays (#1498)", async () => {
    const requests = await publicEntryRequests();
    await visitProfile(MIXED_SEED);
    const disciplines = () => requests.calls.map(call => new URL(call.request.url).searchParams.get("discipline"));

    await placeHeaders()[1].click();
    await expect(exactText("Sport Seed")).toBeDisplayed();
    await expectEventually(() => textContents(".place-header"), BOTH_HEADERS);
    expect(disciplines()).toEqual(["sport"]);

    await placeHeaders()[0].click();
    await expect(exactText("Boulder Seed")).toBeDisplayed();
    expect(disciplines()).toEqual(["sport", "boulder"]);
  });

  it("a table loads every page of its climbs, not just the first (#1498)", async () => {
    const owner = await claimOwner();
    const boulderPages = await browser.mock("http://my.localhost:8787/-/api/public/*/entries?*discipline=boulder*");
    boulderPages.respond(
      ({ request }) => {
        const url = new URL(request.url);
        const offset = Number(url.searchParams.get("offset"));
        const count = offset === 0 ? Number(url.searchParams.get("limit")) : 5;
        const entries = Array.from({ length: count }, (_, i) => ({
          id: `paged-${offset + i}`,
          placeId: owner.ownId("p1"),
          type: "boulder",
          status: "send",
          grade: "6A",
          gradeScale: "font",
          date: "2026-01-01",
          name: `Paged ${offset + i}`,
        }));
        return { entries };
      },
      { fetchResponse: false },
    );
    await owner.seed(MIXED_SEED);
    await clearCookies();
    await browser.url(owner.url(""));
    await expect(placeHeaders()[0]).toBeDisplayed();

    await placeHeaders()[0].click();
    await expect($(".show-all-btn")).toBeDisplayed();
    await $(".show-all-btn").click();
    await expect(exactText("Paged 204")).toBeDisplayed();
    expect(boulderPages.calls.map(call => Number(new URL(call.request.url).searchParams.get("offset")))).toEqual([
      0, 200,
    ]);
  });

  it("Expand all loads the whole logbook in one go, not a request per table (#1498)", async () => {
    const requests = await publicEntryRequests();
    await visitProfile(MIXED_SEED);

    await $("#collapse-all-btn").click();
    await expect(exactText("Boulder Seed")).toBeDisplayed();
    await expect(exactText("Sport Seed")).toBeDisplayed();
    expect(requests.calls).toHaveLength(1);
    expect(new URL(requests.calls[0].request.url).searchParams.has("locationId")).toBe(false);
  });

  it("a table whose load fails can be retried by collapsing and expanding it (#1498)", async () => {
    const entries = await publicEntryRequests();
    entries.abortOnce();
    await visitProfile(MIXED_SEED);
    const boulder = placeHeaders()[0];

    await boulder.click();
    await expect(sections()).toHaveTextContent(contains("Couldn't load these climbs"));
    await expect(exactText("Boulder Seed")).not.toExist();

    await boulder.click();
    await boulder.click();
    await expect(exactText("Boulder Seed")).toBeDisplayed();
  });

  it("shows the entries table's own empty state when the target user has no data", async () => {
    await visitProfile();
    await expect(sections()).toHaveTextContent(contains("Nothing to show here"));
  });

  it("#470 -- shows a loading state before the counts-only shell fetch resolves, then flips to the real empty state once confirmed", async () => {
    const owner = await claimOwner();
    const releaseCounts = await holdRequests(`/-/api/public/${owner.username}/entries/counts`);
    await clearCookies();
    await browser.url(owner.url(""));

    await expect(sections()).toHaveTextContent(contains("Loading"));
    await expect(sections()).not.toHaveTextContent(contains("Nothing to show here"));

    await releaseCounts();
    await expect(sections()).toHaveTextContent(contains("Nothing to show here"));
  });
});
