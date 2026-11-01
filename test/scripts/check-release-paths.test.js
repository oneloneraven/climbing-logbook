import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkReleasePaths } from "../../.github/scripts/check-release-paths.mjs";

const config = JSON.parse(readFileSync(".github/release-paths.json", "utf8"));

describe("checkReleasePaths", () => {
  it("accepts files that never reach users", () => {
    const changed = [
      "docs/workflow.md",
      ".github/workflows/test.yml",
      ".claude/settings.json",
      "test/scripts/check-release-paths.test.js",
      "e2e/areas.js",
      "scripts/seed-preview-data.mjs",
      "scripts/synthetic-check.mjs",
      ".gitignore",
      "biome.json",
      "vitest.config.js",
      "CLAUDE.md",
    ];
    expect(checkReleasePaths(changed, config)).toEqual({ ok: true, offending: [] });
  });

  it("names every file that can reach users", () => {
    const reaching = [
      "infra/access.tf",
      "migrations/0001_better_auth_core.sql",
      "server/index.js",
      "views/help/index.md",
      "scripts/lib/build-version.mjs",
      "wrangler.jsonc",
    ];
    expect(checkReleasePaths(["docs/workflow.md", ...reaching], config).offending).toEqual(reaching);
  });

  it("limits a root-only pattern to the repository root", () => {
    expect(checkReleasePaths(["README.md"], config).ok).toBe(true);
    expect(checkReleasePaths(["views/help/index.md"], config).ok).toBe(false);
  });

  it("matches a directory entry only as a prefix and a file entry only exactly", () => {
    expect(checkReleasePaths(["docs-extra.txt", "biome.json.bak"], config).offending).toEqual([
      "docs-extra.txt",
      "biome.json.bak",
    ]);
  });

  it("rejects a forbidden path even when an allowed entry covers it", () => {
    const cfg = { noneAllowed: ["docs/"], noneForbidden: ["docs/adr/"] };
    expect(checkReleasePaths(["docs/workflow.md", "docs/adr/README.md"], cfg).offending).toEqual([
      "docs/adr/README.md",
    ]);
  });

  it("forbids infra and migrations outright", () => {
    expect(config.noneForbidden).toEqual(["infra/", "migrations/"]);
  });

  it("accepts an empty change list", () => {
    expect(checkReleasePaths([], config).ok).toBe(true);
  });
});

describe("check-release-paths CLI", () => {
  const run = input => spawnSync("node", [".github/scripts/check-release-paths.mjs"], { input, encoding: "utf8" });

  it("exits 0 and reports success when every file is allowed", () => {
    const result = run("docs/workflow.md\n.github/workflows/test.yml\n");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("never-reaches-users allowlist");
  });

  it("exits 1 and lists the offending files", () => {
    const result = run("docs/workflow.md\ninfra/access.tf\n");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("::error::");
    expect(result.stdout).toContain("infra/access.tf");
    expect(result.stdout).not.toContain("docs/workflow.md");
  });
});
