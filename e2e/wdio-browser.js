import { browser } from "@wdio/globals";

export const currentPath = async () => new URL(await browser.getUrl()).pathname;

export async function waitForPath(path) {
  await browser.waitUntil(async () => (await currentPath()) === path, { timeoutMsg: `never reached ${path}` });
}

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
    { interval: 500, timeoutMsg: "the page kept fetching" },
  );
}

// What Playwright's page.request does: a request outside the page that carries the browser's cookies for that host.
export async function browserFetch(url, init = {}) {
  const { hostname } = new URL(url);
  const cookie = (await browser.getCookies())
    .filter(c => c.domain.replace(/^\./, "") === hostname)
    .map(c => `${c.name}=${c.value}`)
    .join("; ");
  return fetch(url, { ...init, headers: { ...init.headers, cookie } });
}

export async function recordFetches() {
  await browser.execute(() => {
    window.e2eFetches = [];
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const request = new Request(input, init);
      const body = typeof init?.body === "string" ? init.body : null;
      const response = await original(input, init);
      window.e2eFetches.push({ url: request.url, method: request.method, body, status: response.status });
      return response;
    };
  });
}

export async function waitForFetch(urlPart, method) {
  let found;
  await browser.waitUntil(
    async () => {
      const fetches = await browser.execute(() => window.e2eFetches ?? []);
      found = fetches.find(f => f.url.includes(urlPart) && f.method === method);
      return found;
    },
    { timeoutMsg: `no ${method} ${urlPart} finished` },
  );
  return found;
}

export async function tap(element) {
  await element.scrollIntoView({ block: "center" });
  await browser
    .action("pointer", { parameters: { pointerType: "touch" } })
    .move({ origin: element })
    .down()
    .up()
    .perform();
}

export async function boundingBox(element) {
  return browser.execute(el => el.getBoundingClientRect().toJSON(), element);
}
