import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AREAS } from "../../e2e/areas.js";

const SPEC_FILE = /\.e2e\.js$/;
const specs = [
  ...new Set(
    readdirSync(join(process.cwd(), "e2e"))
      .filter(name => SPEC_FILE.test(name))
      .map(name => name.replace(SPEC_FILE, "")),
  ),
];
const tagged = new Set(Object.values(AREAS).flat());

describe("e2e areas (#1263)", () => {
  it("puts every spec in at least one area", () => {
    expect(specs.filter(spec => !tagged.has(spec))).toEqual([]);
  });

  it("names only specs that exist", () => {
    expect([...tagged].filter(spec => !specs.includes(spec))).toEqual([]);
  });
});
