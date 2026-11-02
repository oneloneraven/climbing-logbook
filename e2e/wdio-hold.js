import { browser } from "@wdio/globals";
import { currentContext } from "./wdio-browser.js";

const holds = new Map();

// Playwright's * stops at a slash and ** doesn't; everything else is literal.
function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    if (glob[i] !== "*") source += glob[i].replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    else if (glob[i + 1] === "*") (source += ".*"), i++;
    else source += "[^/]*";
  }
  return new RegExp(`^${source}$`);
}

// browser.mock can't delay an answer, so pause matching requests over WebDriver BiDi until the test releases them.
export async function holdRequests(glob) {
  const context = currentContext();
  const pattern = globToRegExp(glob);
  const held = [];
  let released = false;
  const { intercept } = await browser.networkAddIntercept({ phases: ["beforeRequestSent"], contexts: [context] });
  const listener = ({ isBlocked, intercepts, request }) => {
    if (!isBlocked || !intercepts?.includes(intercept)) return;
    if (!released && pattern.test(request.url)) held.push(request.request);
    else browser.networkContinueRequest({ request: request.request }).catch(() => {});
  };
  await browser.sessionSubscribe({ events: ["network.beforeRequestSent"], contexts: [context] });
  browser.on("network.beforeRequestSent", listener);
  const stop = async () => {
    browser.off("network.beforeRequestSent", listener);
    await browser.networkRemoveIntercept({ intercept }).catch(() => {});
  };
  holds.set(context, [...(holds.get(context) ?? []), stop]);
  return async () => {
    released = true;
    await Promise.all(held.splice(0).map(request => browser.networkContinueRequest({ request }).catch(() => {})));
  };
}

export async function stopHolding() {
  const context = currentContext();
  for (const stop of holds.get(context) ?? []) await stop();
  holds.delete(context);
}
