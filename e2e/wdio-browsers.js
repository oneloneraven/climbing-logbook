import { setupBrowser, setupDriver } from "@wdio/utils/node";

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

// Each worker would otherwise look "stable" up online again for every spec file, and a failed lookup loses the file.
export async function resolveBrowsersOnce(names) {
  if (process.env.E2E_RESOLVED_BROWSERS) return JSON.parse(process.env.E2E_RESOLVED_BROWSERS);
  const resolved = {};
  for (const name of names.filter(name => name !== "safari")) {
    const [{ executablePath, browserVersion }] = await setupBrowser({}, [BROWSERS[name]]);
    const [driver] = await setupDriver({}, [{ ...BROWSERS[name], browserVersion }]);
    resolved[name] = { browser: executablePath, version: browserVersion, driver: driver.executablePath ?? driver };
  }
  process.env.E2E_RESOLVED_BROWSERS = JSON.stringify(resolved);
  return resolved;
}

export function pinned(name, resolved) {
  const pin = resolved[name];
  if (!pin) return BROWSERS[name];
  if (name === "chrome")
    return {
      ...BROWSERS.chrome,
      browserVersion: pin.version,
      "goog:chromeOptions": { ...BROWSERS.chrome["goog:chromeOptions"], binary: pin.browser },
      "wdio:chromedriverOptions": { binary: pin.driver },
    };
  const { browserVersion: _, ...firefox } = BROWSERS.firefox;
  return {
    ...firefox,
    "moz:firefoxOptions": { ...firefox["moz:firefoxOptions"], binary: pin.browser },
    "wdio:geckodriverOptions": { binary: pin.driver },
  };
}

export function selectedBrowsers() {
  const selected = (process.env.E2E_BROWSERS ?? "chrome,firefox").split(",").map(name => name.trim());
  for (const name of selected) if (!BROWSERS[name]) throw new Error(`Unknown browser in E2E_BROWSERS: ${name}`);
  return selected;
}
