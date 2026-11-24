import { waitUntil } from "cloudflare:workers";

export const ENGAGE_ACCOUNTS_URL = "https://engage-api.oneloneraven.com/v1/accounts/cl/";
const TIMEOUT_MS = 5000;
// waitUntil allows about 30 seconds after the response, so one delayed retry fits.
const RETRY_DELAY_MS = 10_000;

const retryable = status => status === 429 || status >= 500;

async function requestClear(env, userId) {
  try {
    const res = await fetch(`${ENGAGE_ACCOUNTS_URL}${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.ACCOUNT_SECRET_CL}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: res.ok, retry: retryable(res.status), fields: { status: res.status } };
  } catch (err) {
    return { ok: false, retry: true, fields: { err } };
  }
}

// Engage holds the user id on feedback and reports as an opaque reference; this clears it there.
export async function clearEngageAccount(env, log, userId, retryDelayMs = RETRY_DELAY_MS) {
  if (!env.ACCOUNT_SECRET_CL) {
    log.warn("engage.account.secret-missing");
    return;
  }
  const first = await requestClear(env, userId);
  if (first.ok) return;
  if (!first.retry) {
    log.warn("engage.account.failed", first.fields);
    return;
  }
  log.warn("engage.account.retry", first.fields);
  await new Promise(resolve => setTimeout(resolve, retryDelayMs));
  const second = await requestClear(env, userId);
  if (!second.ok) log.warn("engage.account.failed", second.fields);
}

// After the account is gone, and never holding up the response: a failure here leaves the deletion done.
export function clearEngageAccountLater(env, log, userId) {
  waitUntil(clearEngageAccount(env, log, userId));
}
