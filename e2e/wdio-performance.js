import { $, $$, browser, expect } from "@wdio/globals";
import { refuseIndexedDb } from "./entries-cache.js";
import { claimOwner } from "./wdio-owner.js";

export const blockIndexedDb = () => browser.addInitScript(refuseIndexedDb);

export async function athlete() {
  const owner = await claimOwner();
  await owner.settings({ athleteMode: true });
  return owner;
}

export async function expectWiderWindowRefetch(url, apiPath) {
  await blockIndexedDb();
  const reports = await browser.mock(`**/-/api/performance/${apiPath}**`);
  await browser.url(url);
  await browser.waitUntil(() => reports.calls.length > 0, { timeoutMsg: `no ${apiPath} report request` });
  const initialUrl = reports.calls[0].request.url;

  await $('[data-window="52w"]').click();
  await browser.waitUntil(() => reports.calls.some(call => call.request.url !== initialUrl), {
    timeoutMsg: "the wider window wasn't fetched",
  });
  const widerUrl = reports.calls.find(call => call.request.url !== initialUrl).request.url;

  const startOf = u => new Date(new URL(u).searchParams.get("start")).getTime();
  expect(startOf(widerUrl)).toBeLessThan(startOf(initialUrl));
}

export async function expectOfflineMessage(owner, path, apiPattern, root) {
  await blockIndexedDb();
  const report = await browser.mock(apiPattern);
  report.respond("", { statusCode: 500, fetchResponse: false });
  await browser.url(owner.url(path));

  await expect($("#performance-offline")).toBeDisplayed();
  await expect($(root)).not.toBeDisplayed();
}

export async function expectSharedChrome(owner) {
  await expect($("climbing-header [data-brand-name]")).toHaveTextContent("Climbing Logbook");
  await expect($("climbing-tab-bar").$("a*=Performance")).toHaveAttribute("aria-current", "page");
  await expect($("#back-to-performance-link")).toHaveAttribute("href", `/${owner.username}/performance`);
}

export async function chooseReportScale(name) {
  await $("#report-grade-scale-btn").click();
  for (const option of await $$('#report-grade-scale-listbox [role="option"]')) {
    if ((await option.getProperty("textContent")).includes(name)) return option.click();
  }
  throw new Error(`No ${name} report scale`);
}
