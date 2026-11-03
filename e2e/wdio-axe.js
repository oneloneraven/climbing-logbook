import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { browser } from "@wdio/globals";

export const WCAG_22_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const AXE_SOURCE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

// @axe-core/webdriverio stops at WebdriverIO 9, so axe-core is injected directly, as that package does.
export async function axeViolations(include = undefined) {
  await browser.execute(`if (!window.axe) { ${AXE_SOURCE} }`);
  return browser.execute(
    (include, tags) =>
      window.axe
        .run(include ? { include: [include] } : document, { runOnly: { type: "tag", values: tags } })
        .then(results => results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join(", ")}`)),
    include,
    WCAG_22_AA,
  );
}
