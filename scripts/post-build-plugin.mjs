// One plugin: Rollup runs writeBundle hooks in parallel, and the worker must be built after the URLs get hashes.
import { contentHashAssetUrls } from "./content-hash-asset-urls.mjs";
import { buildServiceWorker } from "./service-worker-build.mjs";

export function postBuildPlugin() {
  return {
    name: "logbook-post-build",
    applyToEnvironment: environment => environment.name === "client",
    async writeBundle(options, bundle) {
      contentHashAssetUrls(options.dir);
      await buildServiceWorker(options.dir, bundle);
    },
  };
}
