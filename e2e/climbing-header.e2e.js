import { $, browser, expect } from "@wdio/globals";
import { boundingBox } from "./wdio-browser.js";
import { mockTurnstile } from "./wdio-turnstile.js";

const brandName = () => $("climbing-header [data-brand-name]");

describe("climbing header", () => {
  it("renders the logo/title and opens/closes the footnote modal via Escape", async () => {
    await browser.url("/login/");

    await expect(brandName()).toHaveTextContent("Climbing Logbook");
    await expect($("#footnote-overlay")).not.toBeDisplayed();

    await $("#footnote-trigger").click();
    await expect($("#footnote-overlay")).toBeDisplayed();
    await expect($("#footnote-close")).toBeFocused();

    await browser.keys("Escape");
    await expect($("#footnote-overlay")).not.toBeDisplayed();
    await expect($("#footnote-trigger")).toBeFocused();
  });

  it("draws the lockup from the preloaded, content-hashed SVG, with the button over 'or not'", async () => {
    await browser.url("/login/");
    const preload = await $('link[rel="preload"][href^="/-/brand-lockup.svg"]').getAttribute("href");
    expect(preload).toMatch(/^\/-\/brand-lockup\.svg\?v=[0-9a-f]{10}$/);
    await expect($("#brand-lockup use")).toHaveAttribute("href", `${preload}#lockup`);
    const svg = await browser.execute(async url => (await fetch(url)).text(), preload);
    expect(svg).toContain('<symbol id="lockup"');

    await expect($("#brand-lockup")).toBeDisplayed();
    await expect($("#footnote-trigger")).toBeDisplayed();
    const lockup = await boundingBox($("#brand-lockup"));
    const button = await boundingBox($("#footnote-trigger"));
    expect(button.x).toBeGreaterThan(lockup.x + lockup.width * 0.8);
    expect(button.x + button.width).toBeLessThanOrEqual(lockup.x + lockup.width + 0.5);
    expect(button.y).toBeGreaterThan(lockup.y + lockup.height * 0.6);
    expect(button.y + button.height).toBeLessThanOrEqual(lockup.y + lockup.height + 0.5);
  });

  it("footnote modal closes via its close button and via backdrop click", async () => {
    await browser.url("/login/");

    await $("#footnote-trigger").click();
    await $("#footnote-close").click();
    await expect($("#footnote-overlay")).not.toBeDisplayed();

    await $("#footnote-trigger").click();
    const backdrop = await boundingBox($("#footnote-overlay"));
    await $("#footnote-overlay").click({
      x: 5 - Math.round(backdrop.width / 2),
      y: 5 - Math.round(backdrop.height / 2),
    });
    await expect($("#footnote-overlay")).not.toBeDisplayed();
  });

  it("renders on the sign-up, reset password and apex pages", async () => {
    await mockTurnstile();
    for (const path of ["/register/", "/reset-password/", "/"]) {
      await browser.url(path);
      await expect(brandName()).toHaveTextContent("Climbing Logbook", { message: path });
    }
  });
});
