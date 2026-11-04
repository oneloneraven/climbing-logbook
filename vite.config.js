// Dev server only, and not wrangler dev: it ignores my. hosts and rewrites the origin, breaking Better Auth's check.
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { CLIENT_ENTRIES } from "./vite.entries.mjs";

// Serves /-/<name>-app.js from source with HMR, so templates never know dev from prod.
function devEntryRewrite(entries) {
  return {
    name: "logbook-dev-entry-rewrite",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const match = req.url?.match(/^\/-\/([\w-]+)-app\.js$/);
        const source = match && entries[match[1]];
        if (source) req.url = `/${source}`;
        next();
      });
    },
  };
}

// public/ is the production and test build's; sharing it let each overwrite the other's pages.
export default defineConfig({
  publicDir: "public-dev",
  plugins: [cloudflare(), devEntryRewrite(CLIENT_ENTRIES)],
});
