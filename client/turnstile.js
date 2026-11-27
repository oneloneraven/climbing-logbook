// Both widgets live in the identity stack, coraxia (#1707); REAL_SITEKEY_HOSTNAMES must match their domains there.
export const REGISTER_SITEKEY = "0x4AAAAAAEH3RghUN6KSc-uy";
export const ENGAGE_SITEKEY = "0x4AAAAAAGA4Yit4Q7K_7Sl8";
// Cloudflare's always-passes test key, for hosts the real widget isn't registered on.
const TEST_SITEKEY = "1x00000000000000000000AA";
const REAL_SITEKEY_HOSTNAMES = ["climbinglogbook.com", "beta.climbinglogbook.com", "my.climbinglogbook.com"];

function turnstileSitekey(hostname, realSitekey) {
  return REAL_SITEKEY_HOSTNAMES.includes(hostname) ? realSitekey : TEST_SITEKEY;
}

const NORMAL_WIDTH = 300;
const RESPONSE_WAIT_MS = 10_000;

// Every widget rendered before api.js loads, not just the last, renders when it does.
const waitingForLoad = [];

// Hidden unless the check needs a click, when the container gets data-visible for the page to style; api.js is async and may run before this module.
export function renderTurnstile(selector, realSitekey = REGISTER_SITEKEY) {
  let widgetId;
  let container;
  const render = () => {
    container = document.querySelector(selector);
    widgetId = window.turnstile.render(container, {
      sitekey: turnstileSitekey(window.location.hostname, realSitekey),
      appearance: "interaction-only",
      size: container.clientWidth < NORMAL_WIDTH ? "compact" : "normal",
      "before-interactive-callback": () => container.setAttribute("data-visible", ""),
    });
  };
  if (window.turnstile) render();
  else {
    waitingForLoad.push(render);
    window.onTurnstileLoad = () => {
      for (const renderWaiting of waitingForLoad.splice(0)) renderWaiting();
    };
  }

  const getResponse = () => window.turnstile?.getResponse(widgetId);
  return {
    getResponse,
    waitForResponse: async () => {
      const deadline = Date.now() + RESPONSE_WAIT_MS;
      while (!getResponse() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 200));
      return getResponse();
    },
    reset: () => {
      container?.removeAttribute("data-visible");
      window.turnstile?.reset(widgetId);
    },
  };
}
