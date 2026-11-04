import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browser, expect } from "@wdio/globals";

export const NAVIGATION_TIMEOUT = 30000;

// Also waits for the new page's load event, so the next command meets a loaded page.
export async function waitForUrl(matches, description = "the expected URL") {
  let last = "nothing";
  await browser
    .waitUntil(
      async () => {
        const page = await browser.execute(() => [location.href, document.readyState]).catch(() => null);
        if (page) last = `${page[0]} (${page[1]})`;
        return page?.[1] === "complete" && matches(new URL(page[0]));
      },
      { timeout: NAVIGATION_TIMEOUT },
    )
    .catch(() => {
      throw new Error(`never reached ${description}; last saw ${last}`);
    });
}

export const currentPath = () => browser.execute(() => location.pathname);

export const waitForPath = path => waitForUrl(url => url.pathname === path, path);

// The page has loaded and fetched nothing new for half a second.
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

// A request from outside the page that carries the browser's cookies for that host.
export async function browserFetch(url, init = {}, partition = undefined) {
  const { hostname } = new URL(url);
  const { cookies } = await browser.storageGetCookies({ partition: partition ?? (await userContextPartition()) });
  const cookie = cookies
    .filter(c => c.domain.replace(/^\./, "") === hostname)
    .map(c => `${c.name}=${c.value.value}`)
    .join("; ");
  return fetch(url, { ...init, headers: { ...init.headers, cookie } });
}

// Call before navigating: the records outlast navigations.
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
    all: () => [...fetches],
    // Start waiting before the action that sends it.
    next(urlPart, method) {
      const since = fetches.length;
      const find = () => fetches.slice(since).find(f => f.url.includes(urlPart) && f.method === method);
      const finished = browser
        .waitUntil(find, { timeout: NAVIGATION_TIMEOUT, timeoutMsg: `no ${method} ${urlPart} finished` })
        .then(find);
      finished.catch(() => {});
      return finished;
    },
  };
}

// A re-rendered element leaves the old node alive, so look it up again.
export async function requery(element) {
  if (typeof element.selector !== "string") return element;
  const parent = element.parent?.selector ? await requery(element.parent) : browser;
  return element.index === undefined ? parent.$(element.selector) : (await parent.$$(element.selector))[element.index];
}

// No transition running, the element has stopped moving, and it's what a pointer at its centre would hit.
export async function waitUntilActionable(element) {
  await browser.waitUntil(() =>
    browser.execute(
      () =>
        // Capped as WebdriverIO's own stability check is: a frame that never comes would hang waitUntil for good.
        new Promise(resolve => {
          const settled = () =>
            resolve(!document.getAnimations().some(a => a instanceof CSSTransition && a.playState === "running"));
          const timer = setTimeout(settled, 100);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              clearTimeout(timer);
              settled();
            }),
          );
        }),
    ),
  );
  // Looked up afresh each time: the page may have redrawn it meanwhile.
  let current = await requery(element);
  await current.waitForStable();
  await browser.waitUntil(
    async () => {
      current = await requery(element);
      return browser.execute(target => {
        if (!target.isConnected) return false;
        const isHit = () => {
          const box = target.getBoundingClientRect();
          const hit = target.getRootNode().elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return target === hit || target.contains(hit);
        };
        if (isHit()) return true;
        // Scrolled again on every try: the page may have moved it since.
        target.scrollIntoView({ block: "center", inline: "center" });
        return isHit();
      }, current);
    },
    { timeoutMsg: `${element.selector} never came out from under whatever covers it` },
  );
  return current;
}

export async function tap(target) {
  const element = await waitUntilActionable(await target);
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

// Asserts once more after the retries, for the failure message.
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

const cleanups = new Map();

export function afterThisTest(cleanup) {
  const context = currentContext();
  cleanups.set(context, [...(cleanups.get(context) ?? []), cleanup]);
}

export async function cleanUpThisTest() {
  const context = currentContext();
  for (const cleanup of cleanups.get(context) ?? []) await cleanup();
  cleanups.delete(context);
}

let windowContext;

// Outside parallel mode, each test runs in a fresh session's one window.
export async function startInFreshWindow() {
  if (windowContext) await browser.reloadSession();
  windowContext = await browser.getWindowHandle();
}

export function currentContext() {
  const context = browser.__parallelContextStore?.getStore() ?? windowContext;
  if (!context) throw new Error("This needs WebdriverIO's userContexts parallel mode, or startInFreshWindow");
  return context;
}

export async function currentUserContext() {
  const { contexts } = await browser.browsingContextGetTree({ root: currentContext(), maxDepth: 0 });
  return contexts[0].userContext;
}

// The whole user context's cookies: WebdriverIO's own cookie commands only reach the current page's origin.
export const userContextPartition = async () => ({ type: "storageKey", userContext: await currentUserContext() });

// browser.deleteCookies misses cookies in Firefox from about:blank, so clear the whole user context.
export async function clearCookies() {
  await browser.storageDeleteCookies({ partition: await userContextPartition() });
}

// This test's downloads land in their own folder.
export function temporaryFolder() {
  const folder = mkdtempSync(join(tmpdir(), "e2e-"));
  afterThisTest(() => rmSync(folder, { recursive: true, force: true }));
  return folder;
}

export async function captureDownloads() {
  const folder = temporaryFolder();
  await browser.browserSetDownloadBehavior({
    downloadBehavior: { type: "allowed", destinationFolder: folder },
    userContexts: [await currentUserContext()],
  });
  return {
    async next() {
      let name;
      await browser.waitUntil(
        () => {
          name = readdirSync(folder).find(file => !/\.(crdownload|part)$/.test(file));
          return name && statSync(join(folder, name)).size > 0;
        },
        { timeoutMsg: "nothing downloaded" },
      );
      return { name, text: () => readFileSync(join(folder, name), "utf8") };
    },
  };
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

// browser.newWindow opens in the default user context, away from this test's cookies and storage.
export async function openTab(url) {
  const { context } = await browser.browsingContextCreate({ type: "tab", userContext: await currentUserContext() });
  const tab = (await browser.browsingContexts()).find(candidate => candidate.contextId === context);
  await tab.navigate(url);
  return tab;
}

// Setting a file input's value from a script is refused, so hand the file over as a user would.
export async function chooseFile(input, file) {
  const element = await input;
  await browser.inputSetFiles({ context: currentContext(), element: { sharedId: element.elementId }, files: [file] });
}

// Every page this test's tab starts loading, however briefly it stays.
export async function recordNavigations() {
  const context = currentContext();
  const urls = [];
  await browser.sessionSubscribe({ events: ["browsingContext.navigationStarted"], contexts: [context] });
  const listener = event => {
    if (event.context === context) urls.push(new URL(event.url));
  };
  browser.on("browsingContext.navigationStarted", listener);
  afterThisTest(() => browser.off("browsingContext.navigationStarted", listener));
  return urls;
}

// The service worker's own fetches still reach the network: neither browser applies BiDi network conditions to workers.
export async function goOffline() {
  const restore = await browser.emulate("onLine", false);
  let online = false;
  const goOnline = async () => {
    if (online) return;
    online = true;
    await restore();
  };
  afterThisTest(goOnline);
  return goOnline;
}
