// Both widgets live in the identity stack, coraxia (#1707); REAL_SITEKEY_HOSTNAMES must match their domains there.
export const REGISTER_SITEKEY = "0x4AAAAAAEH3RghUN6KSc-uy";
export const ENGAGE_SITEKEY = "0x4AAAAAAGA4Yit4Q7K_7Sl8";
// Cloudflare's always-passes test key, for hosts the real widget isn't registered on.
const TEST_SITEKEY = "1x00000000000000000000AA";
const REAL_SITEKEY_HOSTNAMES = ["climbinglogbook.com", "beta.climbinglogbook.com", "my.climbinglogbook.com"];

function turnstileSitekey(hostname, realSitekey) {
  return REAL_SITEKEY_HOSTNAMES.includes(hostname) ? realSitekey : TEST_SITEKEY;
}

const FLEXIBLE_MIN_WIDTH = 300;
const RESPONSE_WAIT_MS = 10_000;

// Every widget rendered before api.js loads, not just the last, renders when it does.
const waitingForLoad = [];

// Hidden unless the check needs a click, when the container gets data-visible for the page to style; api.js is async and may run before this module.
export function renderTurnstile(selector, realSitekey = REGISTER_SITEKEY) {
  let widgetId;
  let container;
  const renderSized = () => {
    widgetId = window.turnstile.render(container, {
      sitekey: turnstileSitekey(window.location.hostname, realSitekey),
      appearance: "interaction-only",
      size: container.clientWidth < FLEXIBLE_MIN_WIDTH ? "compact" : "flexible",
      theme: document.documentElement.dataset.theme,
      "before-interactive-callback": () => container.setAttribute("data-visible", ""),
    });
  };
  // A container that isn't laid out yet measures 0 and would get the compact size, so wait until it has a width.
  const render = () => {
    container = document.querySelector(selector);
    if (container.clientWidth) return renderSized();
    const observer = new ResizeObserver(() => {
      if (!container.clientWidth) return;
      observer.disconnect();
      renderSized();
    });
    observer.observe(container);
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
