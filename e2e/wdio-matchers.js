import { browser, expect } from "@wdio/globals";
import { requery } from "./wdio-browser.js";

const normalise = text => text.replace(/\s+/g, " ").trim();

// WebdriverIO's toHaveText reads the rendered text, which is empty for hidden elements.
expect.extend({
  async toHaveTextContent(target, expected) {
    const element = await target;
    const matches = text =>
      text !== undefined && (expected instanceof RegExp ? expected.test(text) : this.equals(text, expected));
    let text;
    await browser
      .waitUntil(async () => {
        text = normalise(await (await requery(element)).getProperty("textContent"));
        return matches(text) !== this.isNot;
      })
      .catch(() => {});
    return {
      pass: matches(text),
      message: () =>
        `expected ${element.selector} ${this.isNot ? "not " : ""}to have text content ${this.utils.printExpected(expected)}, got ${this.utils.printReceived(text)}`,
    };
  },
});
