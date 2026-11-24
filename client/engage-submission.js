export const ENGAGE_SUBMISSIONS_URL = "https://engage-api.oneloneraven.com/v1/submissions";

// Engage refuses the whole submission over these, so an over-long value is dropped instead.
const SOURCE_PAGE_MAX = 500;
const CONTEXT_VALUE_MAX = 64;
const OWN_HOST = /(^|\.)climbinglogbook\.com$/;
const SESSION_WAIT_MS = 3000;

// The referrer, kept only when it's one of our own pages: anything else says nothing about where the problem is.
function ownPageOrNothing(url) {
  if (!url || url.length > SOURCE_PAGE_MAX) return undefined;
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) && OWN_HOST.test(parsed.hostname) ? url : undefined;
  } catch {
    return undefined;
  }
}

// Engage takes a bare semver, so "v2.144.6" goes as "2.144.6" and "dev" not at all.
function engageVersion(appVersion) {
  return /^v(\d+\.\d+\.\d+)$/.exec(appVersion ?? "")?.[1];
}

function contextOrNothing(context) {
  const kept = Object.entries(context ?? {})
    .map(([key, value]) => [key, typeof value === "string" ? value.trim() : ""])
    .filter(([, value]) => value && value.length <= CONTEXT_VALUE_MAX);
  return kept.length ? Object.fromEntries(kept) : undefined;
}

export function engageSubmission({
  kind,
  message,
  contactEmail,
  section,
  sourcePage,
  appVersion,
  turnstileToken,
  hpx,
  accountRef,
  context,
}) {
  return {
    product: "cl",
    kind,
    source: "web",
    message,
    contactEmail: contactEmail || undefined,
    sourcePage: ownPageOrNothing(sourcePage),
    section: section || undefined,
    appVersion: engageVersion(appVersion),
    turnstileToken,
    hpx: hpx || undefined,
    accountRef: accountRef || undefined,
    context: contextOrNothing(context),
  };
}

// The form works signed out, so any failure here just sends no account.
export async function currentAccountRef() {
  try {
    const res = await fetch("/-/api/auth/get-session", { signal: AbortSignal.timeout(SESSION_WAIT_MS) });
    if (!res.ok) return undefined;
    const data = await res.json();
    return typeof data?.user?.id === "string" ? data.user.id : undefined;
  } catch {
    return undefined;
  }
}

export function sendToEngage(submission) {
  return fetch(ENGAGE_SUBMISSIONS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submission),
  });
}

export function engageErrorMessage(status, data, { tooMany, empty, fallback }) {
  if (status === 429) return tooMany;
  if (data?.error === "verification-failed") return "Bot verification failed. Please try again.";
  if (data?.error === "invalid-submission" && data.fields?.includes("contactEmail")) {
    return "Enter a valid email address, or leave it blank.";
  }
  if (data?.error === "invalid-submission" && data.fields?.includes("message")) return empty;
  return fallback;
}
