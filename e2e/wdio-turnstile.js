import { browser } from "@wdio/globals";
import { TURNSTILE_SCRIPT, TURNSTILE_STUB } from "./mock-turnstile.js";

export async function mockTurnstile() {
  const script = await browser.mock(TURNSTILE_SCRIPT);
  script.respond(TURNSTILE_STUB, { headers: { "content-type": "application/javascript" }, fetchResponse: false });
}
