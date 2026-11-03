import { mkdirSync, writeFileSync } from "node:fs";
import { browser } from "@wdio/globals";
import { cleanUpThisTest, currentContext, waitUntilActionable } from "./wdio-browser.js";
import { signInDevUser } from "./wdio-owner.js";

const PAGE_REPLACED =
  /navigation canceled by concurrent navigation|Cannot find context with specified id|does not belong to the document|belongs to different document/;

// Playwright rides out the page's own redirects and reloads, which WebDriver BiDi reports as errors,
// and waits for an element to be actionable before clicking it.
// A mocha timeout doesn't say where a test stuck, so a failed test prints the last commands it sent.
const recentCommands = [];
function remember(line) {
  recentCommands.push(`${new Date().toISOString()} ${line}`);
  if (recentCommands.length > 30) recentCommands.shift();
}

export function actLikePlaywright() {
  // Cookies and mocked session responses carry session tokens, which shouldn't reach CI logs.
  const secret = command => command.startsWith("storage") || command === "networkProvideResponse";
  const shown = (command, value) => (secret(command) ? "" : JSON.stringify(value ?? "").slice(0, 300));
  browser.on("command", ({ command, body }) => remember(`> ${command} ${shown(command, body)}`));
  browser.on("result", ({ command, result }) => remember(`< ${command} ${shown(command, result)}`));
  browser.overwriteCommand(
    "click",
    async function (click, options) {
      if (options) return click(options);
      const current = await waitUntilActionable(this);
      return current.elementId === this.elementId ? click() : current.click({ button: "left" });
    },
    { attachToElement: true },
  );
  // WebdriverIO opens the next test's window while this one runs, taking focus, and Firefox only turns keys like
  // Enter into clicks in a focused window.
  browser.overwriteCommand("keys", async (keys, value) => {
    await browser.browsingContextActivate({ context: currentContext() });
    return keys(value);
  });
  browser.overwriteCommand("url", async (url, path, options) => {
    try {
      return await url(path, options);
    } catch (error) {
      if (!PAGE_REPLACED.test(error.message)) throw error;
      await browser.waitUntil(() => browser.execute(() => document.readyState === "complete"));
    }
  });
  browser.overwriteCommand("browsingContextLocateNodes", async (locateNodes, params) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await locateNodes(params);
      } catch (error) {
        if (attempt === 10 || !PAGE_REPLACED.test(error.message)) throw error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  });
}

export async function screenshotFailure(test) {
  if (test?.state !== "failed") return;
  const name = `${test.parent?.title} ${test.title} ${browser.capabilities.browserName} ${Date.now()}`.replace(
    /[^a-z0-9]+/gi,
    "-",
  );
  try {
    const { data } = await Promise.race([
      browser.browsingContextCaptureScreenshot({ context: currentContext() }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("the page didn't paint within 5s")), 5000)),
    ]);
    mkdirSync("test-results/wdio", { recursive: true });
    writeFileSync(`test-results/wdio/${name.slice(0, 150)}.png`, Buffer.from(data, "base64"));
  } catch (error) {
    console.warn(`No screenshot of the failure: ${error.message}`);
  }
}

// Playwright's Desktop Chrome viewport, and the shared specs run as the seeded dev user, as its shared project does.
export const mochaHooks = {
  async beforeEach() {
    recentCommands.length = 0;
    await browser.setViewport({ width: 1280, height: 720 });
    if (process.env.E2E_PROJECT === "shared") await signInDevUser();
  },
  async afterEach() {
    const test = this.currentTest ?? this.test;
    if (test?.state === "failed") console.log(`Last commands before the failure:\n${recentCommands.join("\n")}`);
    await screenshotFailure(test);
    await cleanUpThisTest();
  },
};
