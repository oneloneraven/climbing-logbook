import { $, $$, browser, expect } from "@wdio/globals";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { SHELL_PATHS } from "../shared/owner-routes.js";
import { ownedRouteUrl } from "./owned-route-url.js";
import {
  afterThisTest,
  clearCookies,
  currentContext,
  goOffline,
  recordFetches,
  settle,
  waitForPath,
  waitForUrl,
} from "./wdio-browser.js";
import { signInDevUser } from "./wdio-owner.js";

const ORIGIN = "http://my.localhost:8787";
const logPath = `/${DEV_USER.username}/log`;

// Only Chromium's WebDriver BiDi shows the service worker's own requests (under the worker's context), and only its
// Resource Timing marks what the worker served (deliveryType "cache-storage"). Firefox exposes neither, so the
// tests that check where a response came from run in Chrome only (#1597).
const chromeOnly = browser.capabilities.browserName === "chrome" ? it : it.skip;

// A fresh device's first /log goes via /sync, so wait until it settles.
async function warm(path) {
  await browser.url(ownedRouteUrl(DEV_USER.username, path));
  await waitForPath(`/${DEV_USER.username}${path}`);
  await settle();
  await browser.execute(() => navigator.serviceWorker.ready.then(() => true));
  await browser.refresh();
  await settle();
  await browser.waitUntil(() => browser.execute(() => !!navigator.serviceWorker.controller));
}

const placeHeaders = () => $$(".place-header[data-location-id]");

async function cachedPaths(cachePrefix = "logbook-") {
  return browser.execute(async cachePrefix => {
    const paths = [];
    for (const name of await caches.keys()) {
      if (!name.startsWith(cachePrefix)) continue;
      for (const req of await (await caches.open(name)).keys()) {
        const url = new URL(req.url);
        paths.push(url.pathname + url.search);
      }
    }
    return paths;
  }, cachePrefix);
}

async function watchNetwork(event, onEvent) {
  await browser.sessionSubscribe({ events: [event] });
  browser.on(event, onEvent);
  afterThisTest(() => browser.off(event, onEvent));
}

// Playwright's request.serviceWorker(): Chromium reports the worker's requests under its own context, not the tab's.
// No context at all is the browser's own, such as favicons.
async function recordWorkerRequests() {
  const tab = currentContext();
  const paths = [];
  await watchNetwork("network.beforeRequestSent", ({ context, request }) => {
    if (context !== tab && context !== null) paths.push(new URL(request.url).pathname + new URL(request.url).search);
  });
  return paths;
}

// Browsers fetch these for their own UI, outside the page and the worker.
const BROWSER_ICONS = ["/-/favicon-", "/-/apple-touch-icon"];
const isBrowserIcon = path => BROWSER_ICONS.some(icon => path.startsWith(icon));

const navigationFromWorker = () =>
  browser.execute(() => performance.getEntriesByType("navigation")[0].deliveryType === "cache-storage");

describe("offline launch", () => {
  beforeEach(() => signInDevUser("my.localhost"));

  it("an owner page registers the root-scoped worker and is controlled by it", async () => {
    await warm("/log");
    const scope = await browser.execute(async () => (await navigator.serviceWorker.getRegistration()).scope);
    expect(scope).toBe(`${ORIGIN}/`);
  });

  it("offline cold launch: a fresh navigation to a visited owner page renders from the device", async () => {
    await warm("/log");
    await warm("/view/map");
    await goOffline();

    await browser.url(ownedRouteUrl(DEV_USER.username, "/log"));
    await expect(placeHeaders()[0]).toBeDisplayed();

    await browser.url(ownedRouteUrl(DEV_USER.username, "/view/map"));
    await expect($("climbing-tab-bar")).toExist();
  });

  // Offline emulation misses the worker's own fetches, so check its cache as installed, before other pages add to it.
  it("after visiting only /log, everything every owner page loads is already in the worker's cache", async () => {
    await browser.addInitScript(() => performance.setResourceTimingBufferSize(10000));
    await browser.url(ownedRouteUrl(DEV_USER.username, "/log"));
    await waitForPath(logPath);
    await browser.execute(() => navigator.serviceWorker.ready.then(() => true));
    const cached = await cachedPaths();

    // Online-only by design: the API and map data.
    const onlineOnly = ["/-/api/", "/-/world-map-"];
    const missing = [];
    for (const [ownerPage, shell] of Object.entries(SHELL_PATHS)) {
      if (!cached.includes(shell)) missing.push(shell);
      await browser.url(ownedRouteUrl(DEV_USER.username, `/${ownerPage}`));
      await expect($("#header-menu-btn")).toExist({ message: ownerPage });
      await settle();
      const loaded = await browser.execute(() =>
        performance
          .getEntriesByType("resource")
          .map(entry => new URL(entry.name))
          .filter(url => url.origin === location.origin)
          .map(url => url.pathname + url.search),
      );
      for (const path of loaded) {
        if (path.startsWith("/-/") && !onlineOnly.some(prefix => path.startsWith(prefix)) && !cached.includes(path))
          missing.push(`${path} (${ownerPage})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("the installed app's start page (/-/launch/) opens offline and lands on the signed-in user's log", async () => {
    await warm("/log");
    await goOffline();
    await browser.url(`${ORIGIN}/-/launch/`);
    await waitForUrl(url => url.href === ownedRouteUrl(DEV_USER.username, "/log"));
    await expect(placeHeaders()[0]).toBeDisplayed();
  });

  chromeOnly("an interrupted install keeps what it fetched, and the retry fetches only the rest", async () => {
    const workerFetches = await recordWorkerRequests();
    let failManifest = true;
    const { intercept } = await browser.networkAddIntercept({
      phases: ["beforeRequestSent"],
      urlPatterns: [{ type: "pattern", pathname: "/-/manifest.json" }],
    });
    await watchNetwork("network.beforeRequestSent", ({ isBlocked, intercepts, request }) => {
      if (!isBlocked || !intercepts?.includes(intercept)) return;
      const answer = failManifest ? browser.networkFailRequest : browser.networkContinueRequest;
      answer.call(browser, { request: request.request }).catch(() => {});
    });
    afterThisTest(() => browser.networkRemoveIntercept({ intercept }).catch(() => {}));

    await browser.url(ownedRouteUrl(DEV_USER.username, "/log"));
    await waitForPath(logPath);
    await browser.waitUntil(() => workerFetches.includes("/-/manifest.json"), { timeoutMsg: "no manifest fetch" });
    await browser.waitUntil(() =>
      browser.execute(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return !registration?.installing && !registration?.active;
      }),
    );
    const firstAttempt = workerFetches.length;
    expect(firstAttempt).toBeGreaterThan(40);

    failManifest = false;
    await browser.refresh();
    await browser.execute(() => navigator.serviceWorker.ready.then(() => true));
    expect(workerFetches.slice(firstAttempt).filter(path => path !== "/service-worker.js")).toEqual([
      "/-/manifest.json",
    ]);
  });

  chromeOnly("a warm launch takes the document and every static asset from the worker, not the network", async () => {
    await warm("/log");
    await browser.url(ownedRouteUrl(DEV_USER.username, "/log"));
    await expect(placeHeaders()[0]).toBeDisplayed();
    expect(await navigationFromWorker()).toBe(true);
    const fromNetwork = await browser.execute(() =>
      performance
        .getEntriesByType("resource")
        .map(entry => [new URL(entry.name).pathname, entry.deliveryType])
        .filter(
          ([path, delivery]) => path.startsWith("/-/") && !path.startsWith("/-/api/") && delivery !== "cache-storage",
        )
        .map(([path]) => path),
    );
    expect(fromNetwork.filter(path => !isBrowserIcon(path))).toEqual([]);
  });

  chromeOnly("pages that aren't owner pages are never served by the worker", async () => {
    await warm("/log");
    // Signed in, /login/ would redirect to the log mid-check.
    await clearCookies();
    const workerFetches = await recordWorkerRequests();
    for (const path of [`/${DEV_USER.username}`, "/help/", "/login/"]) {
      await browser.url(`${ORIGIN}${path}`);
      expect({ path, fromWorker: await navigationFromWorker() }).toEqual({ path, fromWorker: false });
      expect({ path, passedThroughWorker: workerFetches.includes(path) }).toEqual({ path, passedThroughWorker: false });
    }
  });

  it("API responses never end up in the worker's cache", async () => {
    await warm("/log");
    await warm("/view/map");
    const cachedUrls = await cachedPaths("");
    expect(cachedUrls.length).toBeGreaterThan(0);
    expect(cachedUrls.filter(p => p.startsWith("/-/api/"))).toEqual([]);
    expect(cachedUrls).toContain("/log/index.html");
    expect(cachedUrls.filter(p => p.startsWith(`/${DEV_USER.username}/`))).toEqual([]);
  });

  it("logging out deletes the worker's caches: no owner shell survives the session", async () => {
    await warm("/log");
    expect(await cachedPaths()).toContain("/log/index.html");

    // Stubbed: a real sign-out would end the shared dev session. The login page's session check is told
    // there's none, as after a real sign-out, or it would bounce back to /log.
    const signOut = await browser.mock("**/-/api/auth/sign-out");
    signOut.respond({}, { fetchResponse: false });
    await $("#header-menu-btn").click();
    const session = await browser.mock("**/-/api/auth/get-session");
    session.respond("null", { headers: { "content-type": "application/json" }, fetchResponse: false });
    await $("#login-toggle-btn").click();
    await waitForPath("/-/login/");
    await settle();
    expect(new URL(await browser.getUrl()).pathname).toBe("/-/login/");
    const after = await cachedPaths();
    expect(after.filter(p => p.endsWith("/index.html"))).toEqual([]);
    expect(after.filter(p => !p.startsWith("/-/"))).toEqual([]);
  });

  it("a lapsed session: reads 401 and the worker-served page keeps the cached logbook", async () => {
    await warm("/log");
    const places = (await placeHeaders()).length;
    expect(places).toBeGreaterThan(0);

    await clearCookies();
    const fetches = await recordFetches();
    await browser.url(ownedRouteUrl(DEV_USER.username, "/log"));
    await settle();

    const reads = fetches
      .all()
      .filter(
        f => f.method === "GET" && /^\/-\/api\/(entries|places|locations|settings)$/.test(new URL(f.url).pathname),
      )
      .map(f => `${new URL(f.url).pathname} ${f.status}`);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every(read => read.endsWith(" 401"))).toBe(true);
    await expect(placeHeaders()).toBeElementsArrayOfSize(places);
  });
});
