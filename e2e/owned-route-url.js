// Owner routes only resolve on my.localhost; bare localhost 404s with no hint why.
export const OWNED_ORIGIN = "http://my.localhost:8787";

export function ownedRouteUrl(username, path) {
  return `${OWNED_ORIGIN}/${username}${path}`;
}
