import { json, parseJsonBody } from "../lib/json.js";
import { mintInviteCode } from "../../shared/invite-code.js";

const LIST_LIMIT = 500;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signUpUrl(request, code) {
  const url = new URL(request.url);
  url.hostname = url.hostname.replace(/^admin\./, "");
  url.pathname = "/register/";
  url.search = new URLSearchParams({ code }).toString();
  return url.href;
}

export async function listInvites(request, env) {
  const { results } = await env.LOGBOOK_DB.prepare(
    `SELECT i.code, i.email, i.used_at, i.created_at, u.displayUsername AS used_by_username
     FROM beta_invites i LEFT JOIN "user" u ON u.id = i.used_by
     ORDER BY i.created_at DESC, i.code LIMIT ?`,
  )
    .bind(LIST_LIMIT)
    .all();
  return json({
    invites: results.map(row => ({
      code: row.code,
      email: row.email,
      createdAt: row.created_at,
      usedAt: row.used_at,
      usedBy: row.used_by_username,
      url: signUpUrl(request, row.code),
    })),
  });
}

export async function createInvite(request, env) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return json({ error: "Invalid JSON" }, 400);
  const email = parsed.body?.email ?? null;
  if (email !== null && (typeof email !== "string" || !EMAIL_SHAPE.test(email))) {
    return json({ error: "That isn't a valid email address" }, 400);
  }
  const code = mintInviteCode();
  const pinned = email?.toLowerCase() ?? null;
  await env.LOGBOOK_DB.prepare(`INSERT INTO beta_invites (code, email) VALUES (?, ?)`).bind(code, pinned).run();
  return json({ code, email: pinned, url: signUpUrl(request, code) }, 201);
}
