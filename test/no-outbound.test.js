import { expect, it } from "vitest";

it("never reaches a real service from a unit test (#1456)", async () => {
  const res = await fetch("https://example.org/");
  expect(res.status).toBe(599);
});
