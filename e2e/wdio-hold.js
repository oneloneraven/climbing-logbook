import { browser } from "@wdio/globals";
import { currentContext } from "./wdio-browser.js";

const holds = new Map();

const answer = (request, json) =>
  json === undefined
    ? browser.networkContinueRequest({ request })
    : browser.networkProvideResponse({
        request,
        statusCode: 200,
        headers: [{ name: "content-type", value: { type: "string", value: "application/json" } }],
        body: { type: "string", value: JSON.stringify(json) },
      });

// browser.mock can't delay an answer, so pause requests to this path (any query) over WebDriver BiDi until the test
// releases them, to the server or with the given JSON. Don't mix it with browser.mock in a test: a mock lets every
// other paused request go.
export async function holdRequests(pathname) {
  const context = currentContext();
  const held = [];
  let released = false;
  const { intercept } = await browser.networkAddIntercept({
    phases: ["beforeRequestSent"],
    contexts: [context],
    urlPatterns: [{ type: "pattern", pathname }],
  });
  const listener = ({ isBlocked, intercepts, request }) => {
    if (!isBlocked || !intercepts?.includes(intercept)) return;
    if (released) browser.networkContinueRequest({ request: request.request }).catch(() => {});
    else held.push(request.request);
  };
  await browser.sessionSubscribe({ events: ["network.beforeRequestSent"], contexts: [context] });
  browser.on("network.beforeRequestSent", listener);
  holds.set(context, [
    ...(holds.get(context) ?? []),
    async () => {
      browser.off("network.beforeRequestSent", listener);
      await browser.networkRemoveIntercept({ intercept }).catch(() => {});
    },
  ]);
  return async json => {
    released = true;
    await Promise.all(held.splice(0).map(request => answer(request, json).catch(() => {})));
  };
}

export async function stopHolding() {
  const context = currentContext();
  for (const stop of holds.get(context) ?? []) await stop();
  holds.delete(context);
}
