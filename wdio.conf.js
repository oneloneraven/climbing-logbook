import { spawn } from "node:child_process";
import { SevereServiceError } from "webdriverio";
import globalSetup from "./e2e/global-setup.js";
import { CLASSIC_SPEC_NAMES, SHARED_SPEC_NAMES } from "./e2e/shared-specs.js";
import { steadyCommands } from "./e2e/wdio-hooks.js";

const BASE_URL = "http://localhost:8787";
const SERVER_COMMAND =
  "pnpm run html:build && pnpm run tailwind:build && pnpm run e2e:build-fixtures && pnpm run deploy:build && vite preview --config vite.deploy.config.js";
let server;

async function answers(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`The e2e server exited with code ${server.exitCode}`);
    if (await answers(url)) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`${url} didn't answer within ${timeoutMs / 1000}s`);
}

function stopServer() {
  try {
    if (server) process.kill(-server.pid);
  } catch {}
}

const BROWSERS = {
  chrome: {
    browserName: "chrome",
    "wdio:experimentalBiDiCommands": true,
    browserVersion: "stable",
    "goog:chromeOptions": { args: ["--headless=new", "--no-sandbox", "--hide-scrollbars"] },
  },
  firefox: {
    browserName: "firefox",
    "wdio:experimentalBiDiCommands": true,
    browserVersion: "stable",
    "moz:firefoxOptions": {
      args: ["-headless"],
      prefs: {
        "ui.prefersReducedMotion": 1,
        "ui.useOverlayScrollbars": 1,
        "security.webauth.webauthn_enable_softtoken": true,
        "security.webauth.webauthn_enable_usbtoken": false,
      },
    },
  },
  safari: { browserName: "safari" },
};

const specPath = name => `./e2e/${name}.e2e.js`;
const sharedSpecs = SHARED_SPEC_NAMES.map(specPath);
const classicSpecs = CLASSIC_SPEC_NAMES.map(specPath);
const shared = process.env.E2E_PROJECT === "shared";
const classic = process.env.E2E_PROJECT === "classic";
const only = process.env.E2E_SPECS?.split(",").map(specPath);

const selected = (process.env.E2E_BROWSERS ?? "chrome,firefox").split(",").map(name => name.trim());

export const config = {
  runner: "local",
  specs: only ?? (shared ? sharedSpecs : classic ? classicSpecs : ["./e2e/**/*.e2e.js"]),
  exclude: shared || classic ? [] : [...sharedSpecs, ...classicSpecs],
  maxInstances: shared || selected.includes("safari") ? 1 : Number(process.env.E2E_WORKERS ?? 4),
  capabilities: selected.map(name => {
    if (!BROWSERS[name]) throw new Error(`Unknown browser in E2E_BROWSERS: ${name}`);
    return BROWSERS[name];
  }),
  baseUrl: BASE_URL,
  logLevel: "warn",
  // Firefox in CI needs longer than the 5s default.
  waitforTimeout: 10000,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    timeout: 60000,
    require: ["./e2e/wdio-hooks.js", "./e2e/wdio-matchers.js"],
    // WebDriver Classic commands, such as the virtual authenticator, only work outside parallel mode.
    ...(!classic && { parallelMode: "userContexts" }),
    maxParallelContexts: shared ? 1 : Number(process.env.E2E_CONTEXTS ?? 1),
  },
  async onPrepare() {
    if (await answers(`${BASE_URL}/login/`)) {
      if (process.env.CI) throw new SevereServiceError(`Something is already serving ${BASE_URL}; stop it first`);
    } else {
      server = spawn("sh", ["-c", SERVER_COMMAND], {
        stdio: "inherit",
        detached: true,
        env: { ...process.env, CLOUDFLARE_ENV: "e2e" },
      });
      try {
        await waitFor(`${BASE_URL}/login/`, 180000);
      } catch (error) {
        stopServer();
        throw new SevereServiceError(error.message);
      }
    }
    await globalSetup(undefined, { browsers: selected.length });
  },
  before: steadyCommands,
  onComplete() {
    stopServer();
  },
};
