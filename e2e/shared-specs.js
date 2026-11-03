// These use the seeded dev user, change state other specs see, write D1 through wrangler, or measure timing, so they run one at a time.
export const SHARED_SPEC_NAMES = [
  "account-page",
  "admin",
  "apex-links",
  "asset-caching",
  "beta-channel",
  "launch",
  "log-page-boot-perf",
  "login",
  "offline-launch",
  "per-user-data",
  "queue-replay",
  "register",
  "terms-prompt",
  "two-step-recovery",
  "zero-friction-redirect",
];

// These need WebDriver Classic commands, which parallel mode refuses, so they run on their own, a fresh session per test.
export const CLASSIC_SPEC_NAMES = ["passkey-login"];
