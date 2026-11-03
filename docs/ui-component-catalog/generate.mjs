// #565 -- regenerates every screenshot docs/ui-component-catalog.md
// embeds, from the real markup+CSS in swatch.html (see that file's own
// header comment for why it's structured this way). Not part of the
// app's own build -- run by hand whenever a cataloged pattern's real
// rendered appearance changes.
//
// Usage: `pnpm dev` running in another terminal (swatch.html loads its
// stylesheet/tokens from it), then from the repo root:
//   node docs/ui-component-catalog/generate.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { headlessChrome } from "../../scripts/lib/headless-chrome.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SWATCH_URL = `file://${join(HERE, "swatch.html")}`;

// One entry per docs/ui-component-catalog.md screenshot -- the swatch id
// to capture, and the file basename (both dark/light variants share it).
// Keep this list and swatch.html's own #id-per-swatch markup in sync.
const ENTRIES = [
  ["s-error-message", "error-message"],
  ["s-row-card-nav", "row-card-nav"],
  ["s-row-card-settings", "row-card-settings-switch"],
  ["s-row-card-btn", "row-card-settings-button"],
  ["s-switch", "switch-control"],
  ["s-btn", "btn"],
  ["s-page-title", "page-title"],
  ["s-section-heading", "section-heading"],
  ["s-card-section-heading", "card-section-heading"],
  ["s-subsection-heading", "subsection-heading"],
  ["s-row-card-editable", "row-card-editable"],
  ["s-form-card", "form-card"],
  ["s-tone-cards", "tone-cards"],
  ["s-sources-heading", "sources-heading"],
  ["s-modal", "modal-shape"],
  ["s-grades", "grade-colors"],
  ["s-tiers", "evidence-tiers"],
  ["s-list-picker", "list-picker"],
  ["s-date-picker", "date-picker"],
  ["s-help-article", "help-article"],
];

const browser = await headlessChrome();
// WebdriverIO's element screenshots stop at the viewport and truncate fractional
// boxes; these round outwards and reach below the fold, as the originals did.
async function saveSwatch(id, path) {
  const box = await browser.execute(swatchId => {
    const rect = document.getElementById(swatchId).getBoundingClientRect();
    const x = Math.floor(rect.left + scrollX);
    const y = Math.floor(rect.top + scrollY);
    return { x, y, width: Math.ceil(rect.right + scrollX) - x, height: Math.ceil(rect.bottom + scrollY) - y };
  }, id);
  const { data } = await browser.browsingContextCaptureScreenshot({
    context: await browser.getWindowHandle(),
    origin: "document",
    clip: { type: "box", ...box },
  });
  writeFileSync(path, Buffer.from(data, "base64"));
}

try {
  await browser.setViewport({ width: 900, height: 700, devicePixelRatio: 1 });
  for (const theme of ["dark", "light"]) {
    await browser.url(`${SWATCH_URL}?theme=${theme}`);
    // Lets the linked stylesheet (a real network request to the dev
    // server, not an inline/cached one) finish applying before capture.
    await browser.pause(300);
    for (const [id, name] of ENTRIES) {
      await saveSwatch(id, join(HERE, `${name}-${theme}.png`));
      console.log(`saved ${name}-${theme}.png`);
    }
  }
} finally {
  await browser.deleteSession();
}
console.log("done");
