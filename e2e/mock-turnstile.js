export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js**";

export const TURNSTILE_STUB = `
  window.turnstile = {
    render: () => "e2e-stub-widget-id",
    getResponse: () => "e2e-stub-token",
    reset: () => {},
  };
  if (typeof window.onTurnstileLoad === "function") window.onTurnstileLoad();
`;
