import { waitUntil } from "cloudflare:workers";

export const ENGAGE_ACCOUNTS_URL = "https://engage-api.oneloneraven.com/v1/accounts/cl/";
const ATTEMPTS = 2;
const TIMEOUT_MS = 5000;

// Engage holds the user id on feedback and reports as an opaque reference; this clears it there.
export async function clearEngageAccount(env, log, userId) {
  if (!env.ACCOUNT_SECRET_CL) {
    log.warn("engage.account.secret-missing");
    return;
  }
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const event = attempt < ATTEMPTS ? "engage.account.retry" : "engage.account.failed";
    try {
      const res = await fetch(`${ENGAGE_ACCOUNTS_URL}${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${env.ACCOUNT_SECRET_CL}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return;
      log.warn(event, { status: res.status });
    } catch (err) {
      log.warn(event, { err });
    }
  }
}

// After the account is gone, and never holding up the response: a failure here leaves the deletion done.
export function clearEngageAccountLater(env, log, userId) {
  waitUntil(clearEngageAccount(env, log, userId));
}
