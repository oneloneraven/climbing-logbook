import { $, $$, browser, expect } from "@wdio/globals";
import { waitForUrl } from "./wdio-browser.js";
import { holdRequests } from "./wdio-hold.js";
import { gotoLog, SEED } from "./wdio-log.js";

const contains = text => expect.stringContaining(text);
const sections = () => $("#sections");

function manyEntries(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `many-${i}`,
    placeId: "p1",
    type: "boulder",
    status: "send",
    grade: "6A",
    date: "2026-05-01",
    name: `Many Seed ${i}`,
  }));
}

describe("log page", () => {
  it("#470 -- shows a loading state before real data resolves, then flips to the real empty state once confirmed", async () => {
    await gotoLog({});
    const releasePlaces = await holdRequests("/-/api/places");

    await browser.refresh();

    await expect(sections()).toHaveTextContent(contains("Loading"));
    await expect(sections()).not.toHaveTextContent(contains("Nothing to show here"));

    await releasePlaces();
    await expect(sections()).toHaveTextContent(contains("Nothing to show here"));
  });

  it("renders the shared chrome and a real entries table, and switches discipline", async () => {
    await gotoLog();

    await expect($("climbing-header [data-brand-name]")).toHaveTextContent("Climbing Logbook");
    await expect($("climbing-tab-bar").$("a*=Logbook")).toHaveAttribute("aria-current", "page");

    await $("#collapse-all-btn").click();
    await expect(sections()).toHaveTextContent(contains("Boulder Seed"));

    await $("#discipline-btn").click();
    await $('.discipline-option[data-discipline="sport"]').click();
    await expect($("#discipline-btn-label")).toHaveTextContent("Sport");
    await expect(sections()).toHaveTextContent(contains("Sport Seed"));

    await $("#discipline-btn").click();
    await $('.discipline-option[data-discipline="boulder"]').click();
    await expect($("#discipline-btn-label")).toHaveTextContent("Boulder");
  });

  it("#1318 -- a discipline picked while settings load isn't overwritten when they arrive", async () => {
    await gotoLog({ ...SEED, settings: { activeDiscipline: "boulder" } });
    const releaseSettings = await holdRequests("/-/api/settings", {
      method: "GET",
      once: true,
      answerFromWhenSent: true,
    });
    await browser.refresh();
    await releaseSettings.caught();

    await $("#discipline-btn").click();
    await $('.discipline-option[data-discipline="sport"]').click();
    await expect($("#discipline-btn-label")).toHaveTextContent("Sport");

    const menuButton = $("#header-menu-btn");
    await expect(menuButton).toHaveAttribute("data-sync-state", "working");
    await releaseSettings();
    await expect(menuButton).not.toHaveAttribute("data-sync-state");
    await expect($("#discipline-btn-label")).toHaveTextContent("Sport");
  });

  it("#939 follow-up -- location sections start collapsed on the very first paint, no expand-then-collapse flash", async () => {
    await gotoLog();

    const header = () => $(".place-header*=Test Crag");
    const row = () => $("//tr[.//*[normalize-space(text())='Boulder Seed']]");
    await expect(header()).toHaveAttribute("aria-expanded", "false");
    await expect(row()).not.toBeDisplayed();

    await header().click();
    await expect(header()).toHaveAttribute("aria-expanded", "true");
    await expect(row()).toBeDisplayed();
  });

  it("#501 -- a table past one page shows Show more/Show all, both reveal the rest client-side (no fetch)", async () => {
    await gotoLog({ ...SEED, entries: manyEntries(125) });
    await $("#collapse-all-btn").click();

    await expect(sections()).toHaveTextContent(contains("100 of 125 shown"));
    await expect($(".show-more-btn")).toBeDisplayed();
    await expect($(".show-all-btn")).toBeDisplayed();

    const entriesRequests = await browser.mock("**/-/api/entries**", { method: "GET" });

    await $(".show-more-btn").click();
    await expect($$("tbody tr")).toBeElementsArrayOfSize(125);
    await expect($(".show-more-btn")).not.toExist();
    await expect($(".show-all-btn")).not.toExist();
    await expect(sections()).not.toHaveTextContent(contains("shown"));
    expect(entriesRequests.calls).toEqual([]);
  });

  it("#501 -- Show all reveals the exact remainder client-side, no fetch", async () => {
    await gotoLog({ ...SEED, entries: manyEntries(130) });
    await $("#collapse-all-btn").click();
    await expect(sections()).toHaveTextContent(contains("100 of 130 shown"));

    const entriesRequests = await browser.mock("**/-/api/entries**", { method: "GET" });

    await $(".show-all-btn").click();
    await expect($$("tbody tr")).toBeElementsArrayOfSize(130);
    await expect($(".show-more-btn")).not.toExist();
    expect(entriesRequests.calls).toEqual([]);
  });

  it("archived climbs are hidden by default (#63), shown once explicitly filtered for, and Clear restores the default", async () => {
    await gotoLog({
      ...SEED,
      entries: [
        ...SEED.entries,
        {
          id: "e3",
          placeId: "p1",
          type: "boulder",
          status: "archived",
          grade: "6B",
          date: "2026-05-03",
          name: "Archived Seed",
        },
      ],
    });
    const statusFilter = status => $(`#filter-status-group input[data-filter="${status}"]`);

    await expect(sections()).toHaveTextContent(contains("Boulder Seed"));
    await expect(sections()).not.toHaveTextContent(contains("Archived Seed"));

    await $("#filter-btn").click();
    for (const status of ["flash", "send", "project", "checkout"]) await expect(statusFilter(status)).toBeSelected();
    await expect(statusFilter("archived")).not.toBeSelected();
    // A class selector: the base classes contain "active" inside an arbitrary variant.
    await expect($$("#filter-btn.active")).toBeElementsArrayOfSize(0);

    await $('#filter-status-group label:has(input[data-filter="archived"])').click();
    await expect(sections()).toHaveTextContent(contains("Archived Seed"));
    await expect($$("#filter-btn.active")).toBeElementsArrayOfSize(1);

    await $("#filter-clear-btn").click();
    await expect(sections()).not.toHaveTextContent(contains("Archived Seed"));
    await expect(statusFilter("archived")).not.toBeSelected();
    await expect(statusFilter("flash")).toBeSelected();
  });

  it("grade-tier filter narrows the table by tier, and Clear restores every tier", async () => {
    await gotoLog({
      ...SEED,
      entries: [
        ...SEED.entries,
        {
          id: "e3",
          placeId: "p1",
          type: "boulder",
          status: "send",
          grade: "9A",
          gradeScale: "font",
          date: "2026-05-04",
          name: "Elite Roof",
        },
      ],
    });
    const tierFilter = tier => $(`#filter-grade-tier-group input[data-grade-tier="${tier}"]`);

    await expect(sections()).toHaveTextContent(contains("Boulder Seed"));
    await expect(sections()).toHaveTextContent(contains("Elite Roof"));

    await $("#filter-btn").click();
    await expect(tierFilter("intermediate")).toBeSelected();
    await expect(tierFilter("hyper-elite")).toBeSelected();

    await $('#filter-grade-tier-group label:has(input[data-grade-tier="hyper-elite"])').click();
    await expect(sections()).toHaveTextContent(contains("Boulder Seed"));
    await expect(sections()).not.toHaveTextContent(contains("Elite Roof"));
    await expect($$("#filter-btn.active")).toBeElementsArrayOfSize(1);

    await $("#filter-clear-btn").click();
    await expect(sections()).toHaveTextContent(contains("Elite Roof"));
    await expect(tierFilter("hyper-elite")).toBeSelected();
  });

  it("search matches an as-logged grade label, case-insensitively, per the modifier rule", async () => {
    await gotoLog({
      ...SEED,
      entries: [
        ...SEED.entries,
        {
          id: "e3",
          placeId: "p1",
          type: "boulder",
          status: "send",
          grade: "7A+",
          gradeScale: "font",
          date: "2026-05-04",
          name: "Plus Route",
        },
      ],
    });

    await $("#search-btn").click();
    await $("#search").setValue("6a");
    await expect(sections()).toHaveTextContent(contains("Boulder Seed"));
    await expect(sections()).not.toHaveTextContent(contains("Plus Route"));

    await $("#search").setValue("7a");
    await expect(sections()).toHaveTextContent(contains("Plus Route"));
    await expect(sections()).not.toHaveTextContent(contains("Boulder Seed"));

    await $("#search").setValue("7a+");
    await expect(sections()).toHaveTextContent(contains("Plus Route"));

    await $("#search").setValue("7a-");
    await expect(sections()).not.toHaveTextContent(contains("Plus Route"));
  });

  describe("Shared popover behavior (createDisclosure)", () => {
    it("Escape closes the popover and refocuses the trigger", async () => {
      await gotoLog();
      const trigger = $("#discipline-btn");
      const popover = $("#discipline-popover");

      await trigger.click();
      await expect(popover).toBeDisplayed();

      await browser.keys("Escape");
      await expect(popover).not.toBeDisplayed();
      await expect(trigger).toBeFocused();
    });

    it("clicking outside the popover closes it", async () => {
      await gotoLog();
      const popover = $("#discipline-popover");

      await $("#discipline-btn").click();
      await expect(popover).toBeDisplayed();

      await browser.action("pointer").move({ x: 1270, y: 10, origin: "viewport" }).down().up().perform();
      await expect(popover).not.toBeDisplayed();
    });
  });

  it("#561 -- logging out navigates away instead of leaving the visitor stranded on an owner-only page", async () => {
    await gotoLog();
    await $("#header-menu-btn").click();
    await expect($("#login-toggle-btn")).toHaveTextContent("Log out");

    await $("#login-toggle-btn").click();
    await waitForUrl(url => /\/login\/?$/.test(url.pathname), "the login page");
  });

  it("theme toggle flips data-theme and persists to localStorage", async () => {
    await gotoLog();
    await $("#header-menu-btn").click();

    const html = $("html");
    const initial = await html.getAttribute("data-theme");
    const next = initial === "light" ? "dark" : "light";

    await $("#theme-toggle-btn").click();
    await expect(html).toHaveAttribute("data-theme", next);

    expect(await browser.execute(() => localStorage.getItem("logbook_theme"))).toBe(next);

    await browser.refresh();
    await expect(html).toHaveAttribute("data-theme", next);
  });

  it("the footer shows the build's version, and its report and feedback links carry it (#1500)", async () => {
    await gotoLog();
    const version = (await $("#app-version").getProperty("textContent")).trim();
    expect(version).toMatch(/^(dev|v\d+\.\d+\.\d+)$/);
    for (const name of ["Report an issue", "Tell us what you think"]) {
      const href = await $("footer").$(`a=${name}`).getAttribute("href");
      expect(new URL(href, await browser.getUrl()).searchParams.get("version")).toBe(version);
    }
  });
});
