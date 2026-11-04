// Pure, so the worker's caching rules are unit-tested: ADR-0028.
import { SHELL_HEADER, SHELL_PATHS } from "../../shared/owner-routes.js";

// One shell per page type, not per user: the HTML is identical.
export function shellCacheKey(page, origin) {
  return new URL(SHELL_PATHS[page], origin).toString();
}

// Only when the server marked it as this page's shell, so a redirect or error page never is.
export function isCacheableShell(response, page) {
  return (
    response.ok &&
    !response.redirected &&
    response.type !== "opaqueredirect" &&
    response.headers.get(SHELL_HEADER) === page
  );
}

// Static assets: only successful, same-origin responses.
export function isCacheableAsset(response) {
  return response.ok && response.type === "basic";
}
