// Isolated, then shared, then classic: the timing and install specs fail under the isolated specs' load.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CLASSIC_SPEC_NAMES, SHARED_SPEC_NAMES } from "../e2e/shared-specs.js";
import { resolveBrowsersOnce, selectedBrowsers } from "../e2e/wdio-browsers.js";

export async function runE2eWdio(names) {
  await resolveBrowsersOnce(selectedBrowsers());
  const projectOf = name =>
    SHARED_SPEC_NAMES.includes(name) ? "shared" : CLASSIC_SPEC_NAMES.includes(name) ? "classic" : "isolated";
  let failed = false;
  for (const project of ["isolated", "shared", "classic"]) {
    const specs = names?.filter(name => projectOf(name) === project);
    if (specs?.length === 0) continue;
    const env = { ...process.env, E2E_PROJECT: project, ...(specs && { E2E_SPECS: specs.join(",") }) };
    const { status } = spawnSync("pnpm", ["exec", "wdio", "run", "wdio.conf.js"], { stdio: "inherit", env });
    if (status !== 0) failed = true;
  }
  return failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await runE2eWdio());
