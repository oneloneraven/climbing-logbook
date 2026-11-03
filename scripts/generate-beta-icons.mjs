// Rasterises static/-/beta/icon*.svg to the committed PNGs. CHROMIUM_PATH overrides the browser.
//   node scripts/generate-beta-icons.mjs
import { readFileSync } from "node:fs";
import { headlessChrome } from "./lib/headless-chrome.mjs";

const DIR = "static/-/beta";
const OUTPUTS = [
  { svg: "icon.svg", png: "icon-192.png", size: 192 },
  { svg: "icon.svg", png: "icon-512.png", size: 512 },
  { svg: "icon.svg", png: "apple-touch-icon.png", size: 180 },
  { svg: "icon-maskable.svg", png: "icon-maskable-512.png", size: 512 },
];

const browser = await headlessChrome();
try {
  for (const { svg, png, size } of OUTPUTS) {
    await browser.setViewport({ width: size, height: size, devicePixelRatio: 1 });
    const src = `data:image/svg+xml;base64,${readFileSync(`${DIR}/${svg}`).toString("base64")}`;
    const html = `<body style="margin:0"><img src="${src}" width="${size}" height="${size}" style="display:block"></body>`;
    await browser.url(`data:text/html,${encodeURIComponent(html)}`);
    await browser.execute(() => document.querySelector("img").decode());
    await browser.saveScreenshot(`${DIR}/${png}`);
    console.log(`${DIR}/${png}`);
  }
} finally {
  await browser.deleteSession();
}
