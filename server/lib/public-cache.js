// The highest sync_cursor names the public data's state; a hard delete mustn't lower it to an older state's value.
export async function dataVersion(env, userId) {
  const row = await env.LOGBOOK_DB.prepare(
    `SELECT (SELECT max(sync_cursor) FROM entries WHERE user_id = ?1) AS e,
            (SELECT max(sync_cursor) FROM places WHERE user_id = ?1) AS p,
            (SELECT max(sync_cursor) FROM locations WHERE user_id = ?1) AS l`,
  )
    .bind(userId)
    .first();
  return `${row?.e ?? 0}.${row?.p ?? 0}.${row?.l ?? 0}`;
}

// Only what the public handlers read goes in the key, so junk parameters can't make every request a miss.
const READ_PARAMS = new Set([
  "limit",
  "offset",
  "locationId",
  "discipline",
  "afterCreatedAt",
  "afterId",
  "boulderScale",
  "sportScale",
  "dimension",
  "value",
  "start",
  "end",
]);

function marked(response, state) {
  const copy = new Response(response.body, response);
  copy.headers.set("Cache-Control", "no-store");
  copy.headers.set("X-Public-Cache", state);
  return copy;
}

// Keyed by the data's version, so a change makes a new key and nothing needs purging; visibility is checked first.
export async function cachedPublic(request, env, ctx, userId, resource, produce) {
  const asked = new URL(request.url).searchParams;
  const params = new URLSearchParams([...asked].filter(([name]) => READ_PARAMS.has(name)));
  params.sort();
  const version = await dataVersion(env, userId);
  // The day too: the reports count climbs from the last 12 months of today.
  const day = new Date().toISOString().slice(0, 10);
  const key = new Request(`https://public-cache.invalid/${userId}/${resource}/${version}/${day}?${params}`);
  const cache = caches.default;

  const hit = await cache.match(key);
  if (hit) return marked(hit, "HIT");

  const response = await produce();
  if (response.status !== 200) return response;
  const stored = new Response(response.clone().body, response);
  stored.headers.set("Cache-Control", "public, max-age=86400");
  const put = cache.put(key, stored);
  if (ctx?.waitUntil) ctx.waitUntil(put);
  else await put;
  return marked(response, "MISS");
}
