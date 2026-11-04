// In the page too, because a worker-served shell never reaches the server.
import { isDemoUsername } from "./demo-mode.js";
import { renderBlockedPage } from "./blocked-page.js";
import { loginPageUrl } from "./login-url.js";
import { ownerOfPath, readSignedInUser, writeSignedInUser } from "./user-storage.js";

const SESSION_URL = "/-/api/auth/get-session";

export function renderNotAvailableOffline(doc) {
  renderBlockedPage(doc, {
    id: "not-available-offline",
    heading: "Not available offline on this device",
    text: "This logbook hasn't been opened while logged in on this device. Connect to the internet and log in to open it.",
  });
}

export async function ownershipAllowsBoot({
  loc = window.location,
  storage = window.localStorage,
  controlled = !!navigator.serviceWorker?.controller,
  online = navigator.onLine,
  fetchImpl = (...args) => window.fetch(...args),
  doc = document,
  replace = url => window.location.replace(url),
} = {}) {
  const owner = ownerOfPath(loc.pathname);
  // A demo account's pages are served with no session (owned-routes.js's isDemoOwnedPage).
  if (!owner || isDemoUsername(owner)) return true;

  const recorded = readSignedInUser(storage);

  if (!controlled) {
    // Served by the network, so the server's own ownership check passed for this URL's user.
    if (recorded !== owner) writeSignedInUser(storage, owner);
    return true;
  }

  if (recorded === owner) return true;

  // Worker-served for someone this device hasn't recorded as signed in: ask the server, never guess.
  if (!online) {
    renderNotAvailableOffline(doc);
    return false;
  }
  let sessionUser = null;
  try {
    const res = await fetchImpl(SESSION_URL, { credentials: "same-origin" });
    sessionUser = (await res.json())?.user?.username?.toLowerCase() ?? null;
  } catch {
    renderNotAvailableOffline(doc);
    return false;
  }
  if (sessionUser === owner) {
    writeSignedInUser(storage, owner);
    return true;
  }
  replace(sessionUser ? `/${encodeURIComponent(sessionUser)}/log` : loginPageUrl(loc));
  return false;
}
