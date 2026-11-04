// passthrough means no respondWith, as if there were no worker.
import { matchOwnerRoute } from "../../shared/owner-routes.js";

export const LAUNCH_PATH = "/-/launch/";

// Each kind's caching strategy: docs/app-architecture.md, Offline and sync.
export function classifyRequest({ url, method, mode, workerOrigin }) {
  const u = new URL(url);
  if (method !== "GET" || u.origin !== workerOrigin) return { kind: "passthrough" };

  if (mode === "navigate") {
    if (u.pathname === LAUNCH_PATH) return { kind: "launch" };
    const route = matchOwnerRoute(u.pathname);
    return route ? { kind: "owner-shell", page: route.page } : { kind: "passthrough" };
  }

  // Data belongs to client/store.js, never the worker (ADR-0028 decision 3).
  if (u.pathname.startsWith("/-/api/")) return { kind: "passthrough" };
  if (!u.pathname.startsWith("/-/")) return { kind: "passthrough" };
  if (u.pathname.startsWith("/-/chunks/") || u.searchParams.has("v")) return { kind: "immutable" };
  if (u.pathname.startsWith("/-/fonts/")) return { kind: "font" };
  return { kind: "static" };
}
