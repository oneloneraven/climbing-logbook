// Client assets and the Worker in one pass (ADR-0021); CLOUDFLARE_ENV picks the environment and is required.
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { CLIENT_ENTRIES } from "./vite.entries.mjs";
import { postBuildPlugin } from "./scripts/post-build-plugin.mjs";

export default defineConfig({
  plugins: [cloudflare(), postBuildPlugin()],
  preview: {
    port: 8787,
  },
  // Scoped to environments.client: top-level rollupOptions leak into the Worker build.
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: CLIENT_ENTRIES,
          output: {
            // Stable entry names: templates reference them directly and ?v= busts the cache.
            entryFileNames: "-/[name]-app.js",
            chunkFileNames: "-/chunks/[name]-[hash].js",
          },
        },
      },
    },
  },
});
