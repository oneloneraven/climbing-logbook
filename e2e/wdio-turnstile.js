import { browser } from "@wdio/globals";

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js**";

const TURNSTILE_STUB = `
  window.turnstile = {
    render: () => "e2e-stub-widget-id",
    getResponse: () => "e2e-stub-token",
    reset: () => {},
  };
  if (typeof window.onTurnstileLoad === "function") window.onTurnstileLoad();
`;

// Cloudflare's real widget script sometimes hangs here and blocks page load, so stub the three methods pages call.
export async function mockTurnstile() {
  const script = await browser.mock(TURNSTILE_SCRIPT);
  script.respond(TURNSTILE_STUB, { headers: { "content-type": "application/javascript" }, fetchResponse: false });
}

export async function waitForTurnstile() {
  await browser.waitUntil(() => browser.execute(() => !!window.turnstile?.getResponse()), {
    timeoutMsg: "the Turnstile stub never loaded",
  });
}
