// Per-user keys are namespaced by username; device-level keys (theme, scale choices) stay global.
// Nothing is deleted at logout: an unsynced queue stays with its owner.
import { matchOwnerRoute } from "../shared/owner-routes.js";

// Who last signed in on this origin: what the offline ownership check compares a page's owner against.
export const SIGNED_IN_USER_KEY = "logbook_signed_in_user";

export function normalizeUsername(raw) {
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return null;
  }
}

// The owner-page username in `pathname`, normalised, or null when this
// isn't an owner page (public profile, help, the e2e fixture harness, a
// unit test's blank location).
export function ownerOfPath(pathname) {
  const route = matchOwnerRoute(pathname);
  return route ? normalizeUsername(route.username) : null;
}

function currentPathname() {
  return typeof location === "undefined" ? "" : location.pathname;
}

// `base` namespaced to this page's owner; the plain base key anywhere
// that isn't an owner page (so fixture pages and unit tests see the same
// keys they always did).
export function userKey(base, pathname = currentPathname()) {
  const owner = ownerOfPath(pathname);
  return owner ? `${base}:${owner}` : base;
}

export function readSignedInUser(storage) {
  try {
    return storage.getItem(SIGNED_IN_USER_KEY) || null;
  } catch {
    return null;
  }
}

export function writeSignedInUser(storage, username) {
  try {
    storage.setItem(SIGNED_IN_USER_KEY, username.toLowerCase());
  } catch {
    /* storage full or blocked -- the next load records it again */
  }
}

export function clearSignedInUser(storage) {
  try {
    storage.removeItem(SIGNED_IN_USER_KEY);
  } catch {
    /* nothing to clear */
  }
}
