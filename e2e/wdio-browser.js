import { browser, expect } from "@wdio/globals";

// Playwright bounds navigation waits only by the test's timeout, not the 5s assertion timeout.
export const NAVIGATION_TIMEOUT = 30000;

// Like Playwright's waitForURL, this also waits for the new page's load event.
export async function waitForUrl(matches, description = "the expected URL") {
  await browser.waitUntil(
    async () => {
      const page = await browser.execute(() => [location.href, document.readyState]).catch(() => null);
      return page?.[1] === "complete" && matches(new URL(page[0]));
    },
    { timeout: NAVIGATION_TIMEOUT, timeoutMsg: `never reached ${description}` },
  );
}

export const waitForPath = path => waitForUrl(url => url.pathname === path, path);

// Stands in for Playwright's networkidle: the page has loaded and fetched nothing new for half a second.
export async function settle() {
  let last = -1;
  await browser.waitUntil(
    async () => {
      const [ready, count] = await browser.execute(() => [
        document.readyState === "complete",
        performance.getEntriesByType("resource").length,
      ]);
      const quiet = ready && count === last;
      last = count;
      return quiet;
    },
    { interval: 500, timeout: NAVIGATION_TIMEOUT, timeoutMsg: "the page kept fetching" },
  );
}

// What Playwright's page.request does: a request outside the page that carries the browser's cookies for that host.
export async function browserFetch(url, init = {}) {
  const { hostname } = new URL(url);
  const { cookies } = await browser.storageGetCookies({ partition: await userContextPartition() });
  const cookie = cookies
    .filter(c => c.domain.replace(/^\./, "") === hostname)
    .map(c => `${c.name}=${c.value.value}`)
    .join("; ");
  return fetch(url, { ...init, headers: { ...init.headers, cookie } });
}

// Call before navigating. Like Playwright's waitForResponse, the records outlast navigations.
export async function recordFetches() {
  const fetches = [];
  const script = await browser.addInitScript(emit => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const request = new Request(input, init);
      const body = typeof init?.body === "string" ? init.body : null;
      const response = await original(input, init);
      emit({ url: request.url, method: request.method, body, status: response.status });
      return response;
    };
  });
  script.on("data", record => fetches.push(record));
  return {
    // Start waiting before the action that sends it, as with Playwright's waitForResponse.
    next(urlPart, method) {
      const since = fetches.length;
      const find = () => fetches.slice(since).find(f => f.url.includes(urlPart) && f.method === method);
      return browser.waitUntil(find, { timeoutMsg: `no ${method} ${urlPart} finished` }).then(find);
    },
  };
}

// A re-rendered element leaves the old node alive, so look it up again as a Playwright locator does.
export async function requery(element) {
  const parent = element.parent?.selector ? await requery(element.parent) : browser;
  return element.index === undefined ? parent.$(element.selector) : (await parent.$$(element.selector))[element.index];
}

export async function tap(target) {
  const element = await requery(await target);
  await element.scrollIntoView({ block: "center" });
  await browser
    .action("pointer", { parameters: { pointerType: "touch" } })
    .move({ origin: element })
    .down()
    .up()
    .perform();
}

export async function boundingBox(element) {
  return browser.execute(el => el.getBoundingClientRect().toJSON(), await element);
}

export async function waitForResource(urlPart) {
  await browser.waitUntil(
    () => browser.execute(part => performance.getEntriesByType("resource").some(e => e.name.includes(part)), urlPart),
    { timeoutMsg: `the page never fetched ${urlPart}` },
  );
}

export const resourceUrls = () => browser.execute(() => performance.getEntriesByType("resource").map(e => e.name));

export const textContents = (selector, { visibleOnly = false } = {}) =>
  browser.execute(
    (sel, visibleOnly) =>
      [...document.querySelectorAll(sel)]
        .filter(el => !visibleOnly || el.checkVisibility())
        .map(el => el.textContent.replace(/\s+/g, " ").trim()),
    selector,
    visibleOnly,
  );

// Playwright's expect.poll: retry the read until it matches, then assert once more for the failure message.
export async function expectEventually(read, expected) {
  await browser
    .waitUntil(async () => {
      try {
        expect(await read()).toEqual(expected);
        return true;
      } catch {
        return false;
      }
    })
    .catch(() => {});
  expect(await read()).toEqual(expected);
}

export function currentContext() {
  const context = browser.__parallelContextStore?.getStore();
  if (!context) throw new Error("This needs WebdriverIO's userContexts parallel mode");
  return context;
}

// The whole user context's cookies: WebdriverIO's own cookie commands only reach the current page's origin.
export async function userContextPartition() {
  const { contexts } = await browser.browsingContextGetTree({ root: currentContext(), maxDepth: 0 });
  return { type: "storageKey", userContext: contexts[0].userContext };
}

export async function waitForOpenedTab() {
  const opener = currentContext();
  let opened;
  await browser.waitUntil(
    async () => {
      const { contexts } = await browser.browsingContextGetTree({ maxDepth: 0 });
      opened = contexts.find(c => c.originalOpener === opener);
      return opened && opened.url !== "about:blank";
    },
    { timeoutMsg: "no tab opened" },
  );
  return opened;
}
