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
      "e2e/log.spec.js",
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
    const changed = [
      "docs/workflow.md",
      "infra/dns.tf",
      "migrations/0001_init.sql",
      "server/index.js",
      "views/help/start.md",
      "scripts/build.mjs",
      "wrangler.jsonc",
    ];
    expect(checkReleasePaths(changed, config).offending).toEqual([
      "infra/dns.tf",
      "migrations/0001_init.sql",
      "server/index.js",
      "views/help/start.md",
      "scripts/build.mjs",
      "wrangler.jsonc",
    ]);
  });

  it("limits a root-only pattern to the repository root", () => {
    expect(checkReleasePaths(["README.md"], config).ok).toBe(true);
    expect(checkReleasePaths(["views/README.md"], config).ok).toBe(false);
  });

  it("matches a directory entry only as a prefix and a file entry only exactly", () => {
    expect(checkReleasePaths(["docs-extra/a.txt", "biome.json.bak"], config).offending).toEqual([
      "docs-extra/a.txt",
      "biome.json.bak",
    ]);
  });

  it("rejects a forbidden path even when an allowed entry covers it", () => {
    const cfg = { noneAllowed: ["docs/"], noneForbidden: ["docs/generated/"] };
    expect(checkReleasePaths(["docs/a.md", "docs/generated/b.md"], cfg).offending).toEqual(["docs/generated/b.md"]);
  });

  it("accepts an empty change list", () => {
    expect(checkReleasePaths([], config).ok).toBe(true);
  });
});

describe("check-release-paths CLI", () => {
  const run = input =>
    spawnSync("node", [".github/scripts/check-release-paths.mjs"], { input, encoding: "utf8" });

  it("exits 0 and reports success when every file is allowed", () => {
    const result = run("docs/a.md\n.github/workflows/x.yml\n");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("never-reaches-users allowlist");
  });

  it("exits 1 and lists the offending files", () => {
    const result = run("docs/a.md\ninfra/main.tf\n");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("::error::");
    expect(result.stdout).toContain("infra/main.tf");
    expect(result.stdout).not.toContain("docs/a.md");
  });
});
