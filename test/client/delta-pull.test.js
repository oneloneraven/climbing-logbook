import { afterEach, describe, expect, it, vi } from "vitest";
import { pullDelta } from "../../client/delta-pull.js";

const store = { mergeConfirmed: vi.fn(async () => true), confirmedVersion: () => 0 };

function pull(fetchImpl) {
  vi.stubGlobal("fetch", vi.fn(fetchImpl));
  const onFailure = vi.fn();
  return pullDelta({ store, url: "/-/api/entries", table: "entries", onFailure }).then(loaded => ({
    loaded,
    onFailure,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("pullDelta", () => {
  it.each([
    ["a network error", new TypeError("Failed to fetch")],
    ["a timeout", new DOMException("The operation timed out", "TimeoutError")],
  ])("reports %s as a failure", async (_, error) => {
    const { loaded, onFailure } = await pull(async () => {
      throw error;
    });
    expect(loaded).toBe(false);
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it("doesn't report the page unloading mid-request", async () => {
    const { onFailure } = await pull(async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    });
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("doesn't report a server error or an unreadable body as a failure to connect", async () => {
    for (const response of [new Response("{}", { status: 500 }), new Response("not json")]) {
      const { loaded, onFailure } = await pull(async () => response);
      expect(loaded).toBe(false);
      expect(onFailure).not.toHaveBeenCalled();
    }
  });

  it("drops a response that newer confirmed data overtook while it was in flight, and pulls again", async () => {
    let version = 0;
    const overtaken = { ...store, confirmedVersion: () => version };
    const responses = [
      () => {
        version++;
        return Response.json({ entries: [{ id: "a", name: "stale" }], cursor: 5 });
      },
      () => Response.json({ entries: [{ id: "a", name: "fresh" }], cursor: 7 }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => responses.shift()()),
    );
    const loaded = await pullDelta({ store: overtaken, url: "/-/api/entries", table: "entries", onFailure: vi.fn() });
    expect(loaded).toBe(true);
    expect(store.mergeConfirmed).toHaveBeenCalledOnce();
    expect(store.mergeConfirmed).toHaveBeenCalledWith("entries", [{ id: "a", name: "fresh" }]);
  });

  it("merges the rows the server sends", async () => {
    const { loaded, onFailure } = await pull(async () => Response.json({ entries: [{ id: "a" }], cursor: 5 }));
    expect(loaded).toBe(true);
    expect(store.mergeConfirmed).toHaveBeenCalledWith("entries", [{ id: "a" }]);
    expect(onFailure).not.toHaveBeenCalled();
  });
});
