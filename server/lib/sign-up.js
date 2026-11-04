import { json, readBody } from "./json.js";
import { claimInviteAround } from "./beta-gate.js";
import { emailLimitResponse } from "./email-limit.js";
import { turnstileFailure } from "./turnstile.js";

// Turnstile first, so codes can't be tried without it; Better Auth's set-up would hang a later request if built before.
export async function handleSignUp(request, env, createAuth) {
  const { text: bodyText, body } = await readBody(request);

  const failure = await turnstileFailure(env, body);
  if (failure) return json(failure, 403);
  const limited = await emailLimitResponse(env, body.email);
  if (limited) return limited;

  // The body was read above, so it's sent again; the headers carry the client's IP and Origin.
  const forward = () => createAuth().handler(new Request(request, { body: bodyText }));
  if (env.BETA_GATE_ENABLED !== "true") return forward();
  return claimInviteAround(env, body, forward);
}
