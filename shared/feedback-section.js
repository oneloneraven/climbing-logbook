import { matchOwnerRoute } from "./owner-routes.js";

export function feedbackSection(referrer) {
  let url;
  try {
    url = new URL(referrer);
  } catch {
    return "";
  }
  const { hostname, pathname } = url;
  if (pathname.startsWith("/help/")) return "help";
  const route = matchOwnerRoute(pathname);
  if (!route) return hostname.startsWith("my.") && /^\/[^/]+\/?$/.test(pathname) ? "public_logbook" : "";
  const { page } = route;
  if (page === "view/map") return "map";
  if (page === "log" || page === "view") return "logbook";
  if (page.startsWith("performance")) return "performance";
  if (page === "account/import-export") return "import_export";
  if (page.startsWith("account")) return "account";
  return "";
}
