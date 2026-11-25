import { json } from "../lib/json.js";
import { verifyAccessRequest } from "../lib/access.js";
import { actOnUser, listAuditLog, listUsers, setEntryHidden, viewLogbook } from "./admin-users.js";
import { handleUsage } from "./admin-usage.js";
import { createInvite, listInvites } from "./admin-invites.js";

const PAGES = new Set(["/users", "/usage", "/invites", "/activity"]);

export function isAdminHost(hostname) {
  return hostname.startsWith("admin.");
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function handleAdminApi(request, env, pathname, log) {
  const method = request.method;
  if (pathname === "/-/api/admin/test/throw") throw new Error("Test error from the admin host (#1032)");
  if (pathname === "/-/api/admin/users") return method === "GET" ? listUsers(request, env) : null;
  if (pathname === "/-/api/admin/audit") return method === "GET" ? listAuditLog(env) : null;
  if (pathname === "/-/api/admin/usage") return method === "GET" ? handleUsage(env) : null;
  if (pathname === "/-/api/admin/invites") {
    if (method === "GET") return listInvites(request, env);
    return method === "POST" ? createInvite(request, env) : null;
  }
  const logbook = pathname.match(/^\/-\/api\/admin\/users\/([^/]+)\/logbook$/);
  if (logbook) return method === "GET" ? viewLogbook(env, safeDecode(logbook[1])) : null;
  const userAction = pathname.match(/^\/-\/api\/admin\/users\/([^/]+)\/([a-z]+)$/);
  if (userAction)
    return method === "POST" ? actOnUser(request, env, safeDecode(userAction[1]), userAction[2], log) : null;
  const entryAction = pathname.match(/^\/-\/api\/admin\/entries\/([^/]+)\/(hide|unhide)$/);
  if (entryAction)
    return method === "POST" ? setEntryHidden(env, safeDecode(entryAction[1]), entryAction[2] === "hide") : null;
  return null;
}

export async function handleAdminHost(request, env, log) {
  if (!(await verifyAccessRequest(request, env))) return new Response("Forbidden", { status: 403 });

  const { pathname } = new URL(request.url);
  const isRead = request.method === "GET" || request.method === "HEAD";

  if (pathname === "/" && isRead) return Response.redirect(new URL("/users", request.url).href, 302);
  if (PAGES.has(pathname) && isRead) return env.ASSETS.fetch(new Request(new URL("/admin/", request.url), request));
  if (pathname.startsWith("/-/api/admin/")) {
    return (await handleAdminApi(request, env, pathname, log)) ?? json({ error: "Not found" }, 404);
  }
  if (pathname.startsWith("/-/") && isRead) return env.ASSETS.fetch(request);
  return new Response("Not found", { status: 404 });
}
