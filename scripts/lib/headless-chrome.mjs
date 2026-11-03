// A headless Chrome session for the image scripts. CHROMIUM_PATH overrides the browser.
import { remote } from "webdriverio";

export const headlessChrome = () =>
  remote({
    logLevel: "warn",
    capabilities: {
      browserName: "chrome",
      browserVersion: "stable",
      "goog:chromeOptions": {
        args: ["--headless=new", "--hide-scrollbars"],
        ...(process.env.CHROMIUM_PATH && { binary: process.env.CHROMIUM_PATH }),
      },
    },
  });
