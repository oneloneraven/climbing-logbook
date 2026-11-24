import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENGAGE_ACCOUNTS_URL, clearEngageAccount } from "../server/lib/engage-account.js";

const fakeLog = () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() });

let calls;
function stubEngage(...outcomes) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      calls.push({ url: String(url), method: init?.method, auth: init?.headers?.Authorization });
      const outcome = outcomes.shift();
      if (outcome instanceof Error) throw outcome;
      return new Response(null, { status: outcome });
    }),
  );
}

beforeEach(() => {
  env.ACCOUNT_SECRET_CL = "test-account-secret";
});
afterEach(() => {
  delete env.ACCOUNT_SECRET_CL;
  vi.unstubAllGlobals();
});

describe("clearing a deleted account's reference in Engage (#1710)", () => {
  it("asks Engage to clear the account, with the shared secret", async () => {
    stubEngage(204);
    const log = fakeLog();
    await clearEngageAccount(env, log, "user/1");
    expect(calls).toEqual([
      { url: `${ENGAGE_ACCOUNTS_URL}user%2F1`, method: "DELETE", auth: "Bearer test-account-secret" },
    ]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("calls nothing, and says so, when the secret isn't set", async () => {
    delete env.ACCOUNT_SECRET_CL;
    stubEngage();
    const log = fakeLog();
    await clearEngageAccount(env, log, "user-1");
    expect(calls).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("engage.account.secret-missing");
  });

  it("retries once after a failure", async () => {
    stubEngage(503, 204);
    const log = fakeLog();
    await clearEngageAccount(env, log, "user-1");
    expect(calls).toHaveLength(2);
    expect(log.warn.mock.calls).toEqual([["engage.account.retry", { status: 503 }]]);
  });

  it("gives up after the retry, logging the status and never the user id", async () => {
    stubEngage(new TypeError("network down"), 500);
    const log = fakeLog();
    await clearEngageAccount(env, log, "user-1");
    expect(calls).toHaveLength(2);
    expect(log.warn.mock.calls).toEqual([
      ["engage.account.retry", { err: expect.any(TypeError) }],
      ["engage.account.failed", { status: 500 }],
    ]);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("user-1");
  });
});
