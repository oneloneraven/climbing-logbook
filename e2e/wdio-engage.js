import { browser } from "@wdio/globals";
import { ENGAGE_SUBMISSIONS_URL } from "../client/engage-submission.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// The forms post cross-origin, so the preflight needs its own 2xx answer; nothing reaches the real Engage.
export async function mockEngage({ status = 201, body = { id: "e2e-engage-item" } } = {}) {
  const preflight = await browser.mock(ENGAGE_SUBMISSIONS_URL, { method: "options" });
  preflight.respond("", { statusCode: 204, headers: CORS, fetchResponse: false });
  const engage = await browser.mock(ENGAGE_SUBMISSIONS_URL, { method: "post" });
  engage.respond(body, {
    statusCode: status,
    headers: { ...CORS, "Content-Type": "application/json" },
    fetchResponse: false,
  });
  return engage;
}
