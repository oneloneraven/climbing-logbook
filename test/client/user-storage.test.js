import { describe, expect, it } from "vitest";
import {
  ownerOfPath,
  readSignedInUser,
  userKey,
  writeSignedInUser,
  clearSignedInUser,
} from "../../client/user-storage.js";

function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

describe("userKey / ownerOfPath", () => {
  it("namespaces a key to the owner page's username, normalised", () => {
    expect(userKey("logbook_entries_cache", "/raven/log")).toBe("logbook_entries_cache:raven");
    expect(userKey("logbook_entries_cache", "/Raven/performance/rpe")).toBe("logbook_entries_cache:raven");
    expect(ownerOfPath("/r%61ven/view/map")).toBe("raven");
  });

  it("leaves the key alone anywhere that isn't an owner page", () => {
    for (const path of ["/", "/raven", "/help/", "/raven/not-a-page", "/login/"]) {
      expect(userKey("logbook_entries_cache", path), path).toBe("logbook_entries_cache");
    }
  });

  it("with no location at all (the Workers test pool), uses the plain key", () => {
    expect(userKey("logbook_sync_status")).toBe("logbook_sync_status");
  });
});

describe("signed-in user record", () => {
  it("writes lower-case, reads, clears", () => {
    const s = memoryStorage();
    expect(readSignedInUser(s)).toBeNull();
    writeSignedInUser(s, "Raven");
    expect(readSignedInUser(s)).toBe("raven");
    clearSignedInUser(s);
    expect(readSignedInUser(s)).toBeNull();
  });
});
