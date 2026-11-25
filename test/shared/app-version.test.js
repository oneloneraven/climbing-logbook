import { describe, expect, it } from "vitest";
import { validAppVersion, withAppVersion } from "../../shared/app-version.js";

describe("validAppVersion (#1500)", () => {
  it.each(["v2.139.1", "v10.0.0", "dev"])("keeps %s", value => {
    expect(validAppVersion(value)).toBe(value);
  });

  it.each(["2.139.1", "v2.139", "v2.139.1<script>", "", null, 5])("drops %j", value => {
    expect(validAppVersion(value)).toBeUndefined();
  });
});

describe("withAppVersion (#1500)", () => {
  it("adds the version, keeping any query already there", () => {
    expect(withAppVersion("/help/report-an-issue/", "v2.139.1")).toBe("/help/report-an-issue/?version=v2.139.1");
    expect(withAppVersion("/help/report-an-issue/?ref=ray-1", "dev")).toBe(
      "/help/report-an-issue/?ref=ray-1&version=dev",
    );
  });

  it("leaves the link alone when the version isn't one", () => {
    expect(withAppVersion("/help/feedback/", "abc123")).toBe("/help/feedback/");
  });
});
