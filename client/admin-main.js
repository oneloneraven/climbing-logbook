import { startUsers } from "./admin/users.js";
import { startActivity } from "./admin/activity.js";
import { startUsage } from "./admin/usage.js";
import { startInvites } from "./admin/invites.js";

const PAGES = {
  users: { view: "users-view", start: startUsers },
  usage: { view: "usage-view", start: startUsage },
  invites: { view: "invites-view", start: startInvites },
  activity: { view: "activity-view", start: startActivity },
};

const path = location.pathname.replace(/^\/|\/$/g, "");
const page = Object.hasOwn(PAGES, path) ? path : "users";

for (const name of Object.keys(PAGES)) {
  const tab = document.getElementById(`tab-${name}`);
  if (name === page) tab.setAttribute("aria-current", "page");
  else tab.removeAttribute("aria-current");
}
document.getElementById(PAGES[page].view).hidden = false;

PAGES[page].start();
