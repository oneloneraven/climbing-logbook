import { describe, expect, it } from "vitest";
import { SHELL_PATHS, matchOwnerRoute } from "../../shared/owner-routes.js";

const PAGES = Object.keys(SHELL_PATHS);

describe("matchOwnerRoute (#958)", () => {
  it("matches every owner page, with and without one trailing slash", () => {
    for (const page of PAGES) {
      expect(matchOwnerRoute(`/devuser/${page}`)).toEqual({ username: "devuser", page });
      expect(matchOwnerRoute(`/devuser/${page}/`)).toEqual({ username: "devuser", page });
    }
  });

  it.each(["a", "user.name", "user-name_1"])("matches the username %j", username => {
    expect(matchOwnerRoute(`/${username}/log`)).toEqual({ username, page: "log" });
  });

  it("returns the username exactly as it appears in the URL (not decoded)", () => {
    expect(matchOwnerRoute("/j%C3%B6rg/log")).toEqual({ username: "j%C3%B6rg", page: "log" });
  });

  it.each([
    "",
    "/",
    "/devuser",
    "/devuser/",
    "//log",
    "/devuser//log",
    "/devuser/log//",
    "/devuser/log/extra",
    "/devuser/performance/grades",
    "/devuser/account/display",
    "/devuser/settings",
    "/devuser/map",
    "/devuser/LOG",
    "/help/",
    "/help/working-offline/",
    "/login/",
    "/-/api/entries",
    "/-/log-app.js",
    "devuser/log",
  ])("does not match %j", pathname => {
    expect(matchOwnerRoute(pathname)).toBeNull();
  });

  it("does not match inherited object keys as pages", () => {
    expect(matchOwnerRoute("/devuser/constructor")).toBeNull();
    expect(matchOwnerRoute("/devuser/__proto__")).toBeNull();
    expect(matchOwnerRoute("/devuser/hasOwnProperty")).toBeNull();
  });
});
