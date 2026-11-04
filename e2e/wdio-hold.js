import { browser } from "@wdio/globals";
import { afterThisTest, browserFetch, currentContext, userContextPartition } from "./wdio-browser.js";

const respond = (request, statusCode, body) =>
  browser.networkProvideResponse({
    request,
    statusCode,
    headers: [{ name: "content-type", value: { type: "string", value: "application/json" } }],
    body: { type: "string", value: body },
  });

// browser.mock can't delay an answer; don't mix them in a test, as a mock lets every other paused request go.
export async function holdRequests(pathname, { method, once = false, answerFromWhenSent = false } = {}) {
  const context = currentContext();
  const partition = answerFromWhenSent ? await userContextPartition() : undefined;
  const held = [];
  let released = false;
  let caught = false;
  const { intercept } = await browser.networkAddIntercept({
    phases: ["beforeRequestSent"],
    contexts: [context],
    urlPatterns: [{ type: "pattern", pathname }],
  });
  const listener = ({ isBlocked, intercepts, request }) => {
    if (!isBlocked || !intercepts?.includes(intercept)) return;
    if (released || (method && request.method !== method) || (once && caught)) {
      browser.networkContinueRequest({ request: request.request }).catch(() => {});
      return;
    }
    caught = true;
    const sent = answerFromWhenSent
      ? browserFetch(request.url, {}, partition).then(async res => ({ status: res.status, body: await res.text() }))
      : null;
    sent?.catch(() => {});
    held.push({ id: request.request, sent });
  };
  await browser.sessionSubscribe({ events: ["network.beforeRequestSent"], contexts: [context] });
  browser.on("network.beforeRequestSent", listener);
  afterThisTest(async () => {
    browser.off("network.beforeRequestSent", listener);
    await browser.networkRemoveIntercept({ intercept }).catch(() => {});
  });
  const release = async (json, status = 200) => {
    released = true;
    const answer = async ({ id, sent }) => {
      if (json !== undefined) return respond(id, status, JSON.stringify(json));
      if (sent) return sent.then(({ status, body }) => respond(id, status, body));
      return browser.networkContinueRequest({ request: id });
    };
    await Promise.all(held.splice(0).map(request => answer(request).catch(() => {})));
  };
  release.caught = () => browser.waitUntil(() => caught, { timeoutMsg: `nothing asked for ${pathname}` });
  return release;
}
