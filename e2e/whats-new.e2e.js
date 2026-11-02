import { $, $$, browser, expect } from "@wdio/globals";
import { expectEventually, textContents } from "./wdio-browser.js";
import { holdRequests } from "./wdio-hold.js";

const RELEASES = [
  { version: "v9.2.0", date: "2026-10-20", changes: ["A beta-only change."] },
  { version: "v9.1.0", date: "2026-10-19", changes: ["A change on the Main Channel."] },
];
const contains = text => expect.stringContaining(text);

async function serveReleases(releases = RELEASES) {
  const list = await browser.mock("**/-/releases.json");
  list.respond(releases, { fetchResponse: false });
}

async function serve({ version = "v9.1.0" } = {}) {
  const health = await browser.mock("**/-/api/health");
  health.respond({ ok: true, version }, { fetchResponse: false });
  await serveReleases();
}

describe("what's new", () => {
  it("lists beta-only releases under Beta channel and the rest under Main channel (#1506)", async () => {
    await serve();
    await browser.url("/help/whats-new/");

    await expectEventually(() => textContents("#whats-new-list h2"), ["Check our beta", "Main Channel"]);
    const beta = await $("#whats-new-beta").getProperty("textContent");
    const main = await $("#whats-new-main").getProperty("textContent");
    expect(beta).toContain("A beta-only change.");
    expect(beta).toContain("Check our beta");
    expect(main).toContain("A change on the Main Channel.");
    expect(main).not.toContain("A beta-only change.");
    await expect($("#whats-new-list").$('role/link[name="Check our beta"]')).toHaveAttribute(
      "href",
      "/help/beta-channel/",
    );
  });

  it("says so when the beta channel has nothing the main app doesn't (#1506)", async () => {
    await serve({ version: "v9.2.0" });
    await browser.url("/help/whats-new/");
    await expect($("#whats-new-list")).toHaveTextContent(
      contains("Nothing in Check our beta yet that isn't on the Main Channel."),
    );
  });

  it("shows a spinner in the Beta channel section while it checks (#1506)", async () => {
    const answerHealth = await holdRequests("/-/api/health");
    const answerReleases = await holdRequests("/-/releases.json");
    await browser.url("/help/whats-new/");

    const beta = $("#whats-new-beta");
    await expect($('#whats-new-beta [role="status"]')).toHaveTextContent("Checking Check our beta");
    await answerReleases(RELEASES);
    await answerHealth({ ok: true, version: "v9.1.0" });
    await expect(beta).toHaveTextContent(contains("A beta-only change."));
    await expect($('#whats-new-beta [role="status"]')).not.toExist();
  });

  it("keeps the built list, and says so in the Beta channel section, when the beta channel can't be read (#1506)", async () => {
    const list = await browser.mock("**/-/releases.json");
    list.abort();
    await browser.url("/help/whats-new/");

    await expect($("#whats-new-beta")).toHaveTextContent(contains("Couldn't load what's in Check our beta just now."));
    await expect($$("#whats-new-main li")[0]).toBeDisplayed();
  });
});
