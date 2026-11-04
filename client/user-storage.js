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

export function ownerOfPath(pathname) {
  const route = matchOwnerRoute(pathname);
  return route ? normalizeUsername(route.username) : null;
}

function currentPathname() {
  return typeof location === "undefined" ? "" : location.pathname;
}

// The plain base key off owner pages, so fixture pages and unit tests see unprefixed keys.
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
