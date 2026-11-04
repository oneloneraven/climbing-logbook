// ADRs and migrations are exempt: ADRs aren't edited after acceptance, and any migrations/ change deploys to production.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");

const TOP_LEVEL = [
  "client",
  "server",
  "shared",
  "static",
  "views",
  "docs",
  "scripts",
  "test",
  "e2e",
  "infra",
  "migrations",
  "styles",
  ".github",
];
const PATH_TOKEN = new RegExp(
  `(?<![\\w/.@-])((?:${TOP_LEVEL.map(d => d.replace(".", "\\.")).join("|")})\\/[\\w./-]*\\w)`,
  "g",
);
const EXTENSION = /\.(?:js|mjs|cjs|json|jsonc|md|njk|html|css|sql|tf|yml|yaml|txt|svg|png)$/;
const SCANNED = /\.(?:js|mjs|cjs|njk|md|yml|yaml|css|sql|tf|jsonc|html)$/;
const EXEMPT = ["docs/adr/", "migrations/", "test/scripts/dead-path-references"];

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const trackedFiles = new Set(tracked);

// "client/store.js/admin-auth.js" names two files, the second relative to the first's directory.
function splitJoined(token) {
  const parts = token.split(/(?<=\.(?:js|mjs|md|njk|json|css|sql|tf))\//);
  const dir = parts[0].slice(0, parts[0].lastIndexOf("/") + 1);
  return parts.map((part, i) => (i === 0 || TOP_LEVEL.some(d => part.startsWith(`${d}/`)) ? part : dir + part));
}

// From git, not the filesystem, so a clean checkout and a local one agree.
function isGitIgnored(path) {
  try {
    execFileSync("git", ["check-ignore", "--no-index", path, `${path}/_`], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isLive(path) {
  const trimmed = path.replace(/\/$/, "");
  if (trackedFiles.has(trimmed) || tracked.some(file => file.startsWith(`${trimmed}/`))) return true;
  if (!EXTENSION.test(trimmed) && tracked.some(file => file.startsWith(trimmed))) return true;
  return isGitIgnored(trimmed);
}

function deadReferences() {
  const dead = new Set();
  for (const file of tracked) {
    if (!SCANNED.test(file) || EXEMPT.some(prefix => file.startsWith(prefix))) continue;
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const [, token] of text.matchAll(PATH_TOKEN)) {
      if (/[*<>{}$]/.test(token)) continue;
      for (const path of splitJoined(token)) {
        if (!isLive(path)) dead.add(`${file}: ${path}`);
      }
    }
  }
  return [...dead].sort();
}

describe("path references in comments and docs", () => {
  it("has no references to paths that don't exist", () => {
    expect(
      deadReferences(),
      "Fix these references, or delete the comment if it only narrates history (docs/coding-standards.md, Comments and docs)",
    ).toEqual([]);
  });
});
