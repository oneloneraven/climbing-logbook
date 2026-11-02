import { $, $$, browser, expect } from "@wdio/globals";
import { d1Execute } from "../scripts/lib/dev-session.mjs";
import { clearCookies, recordFetches } from "./wdio-browser.js";
import { mockTurnstile, waitForTurnstile } from "./wdio-turnstile.js";

function seedInviteCode(code) {
  d1Execute(`INSERT OR IGNORE INTO beta_invites (code) VALUES ('${code}')`, {
    database: "climbing-logbook-preview",
    env: "preview",
  });
}

// The test sitekey passes by itself; wait for its token rather than race the widget.
async function readyToRegister() {
  if (await $("#beta-agreement").isDisplayed()) await $("#beta-agreement-continue").click();
  await waitForTurnstile();
}

async function openRegister() {
  await mockTurnstile();
  await browser.url("/register/");
  await readyToRegister();
}

async function fillIn({ code, email, username, agree = true }) {
  if (code) await $("#code").setValue(code);
  await $("#email").setValue(email);
  await $("#username").setValue(username);
  await $("#password").setValue("correct-horse-battery-staple");
  if (agree) await $("#agree-terms").click();
  await $("#register-submit-btn").click();
}

describe("register", () => {
  beforeEach(clearCookies);

  it("registers with a valid invite code, shows the check-your-email state", async () => {
    const code = `e2e-register-${Date.now()}`;
    seedInviteCode(code);

    await openRegister();
    await fillIn({ code, email: `e2e-register-${Date.now()}@example.com`, username: `e2euser${Date.now()}` });

    await expect($("#register-form")).not.toBeDisplayed();
    await expect($("#register-success")).toBeDisplayed();
  });

  it("the check-your-email state can send the email again (#1335)", async () => {
    const code = `e2e-resend-${Date.now()}`;
    const email = `e2e-resend-${Date.now()}@example.com`;
    seedInviteCode(code);

    const fetches = await recordFetches();
    await openRegister();
    await fillIn({ code, email, username: `e2eresend${Date.now()}` });
    await expect($("#register-success")).toBeDisplayed();

    const resend = fetches.next("/-/api/auth/send-verification-email", "POST");
    await $("#resend-verification-btn").click();
    const sent = await resend;

    expect(JSON.parse(sent.body)).toMatchObject({ email, turnstileToken: "e2e-stub-token" });
    expect(sent.status).toBe(200);
    await expect($("#resend-status")).toHaveTextContent(expect.stringMatching(/sent a new link/));
    await expect($("#resend-status")).toBeFocused();
  });

  it("won't sign up until the terms of use are agreed", async () => {
    await openRegister();
    await fillIn({
      email: `e2e-noterms-${Date.now()}@example.com`,
      username: `e2enoterms${Date.now()}`,
      agree: false,
    });

    await expect($("#register-error")).toHaveTextContent("Agree to the terms of use to sign up.");
    await expect($("#register-error")).toBeFocused();
    await expect($$("a*=Terms of use")[0]).toHaveAttribute("href", "/help/terms/");
  });

  it("rejects sign-up with no invite code", async () => {
    await openRegister();
    await fillIn({ email: `e2e-noinvite-${Date.now()}@example.com`, username: `e2enoinvite${Date.now()}` });

    await expect($("#register-error")).toBeDisplayed();
    await expect($("#register-success")).not.toBeDisplayed();
    await expect($("#register-error")).toBeFocused();
  });

  it("a reserved-lookalike username isn't available, and the invite code still works", async () => {
    const code = `e2e-reserved-${Date.now()}`;
    seedInviteCode(code);

    await openRegister();
    await fillIn({ code, email: `e2e-reserved-${Date.now()}@example.com`, username: "he1p" });

    await expect($("#register-error")).toHaveTextContent("That username isn't available. Try another.");
    await expect($("#register-error")).toBeFocused();
    await expect($("#register-success")).not.toBeDisplayed();

    await readyToRegister();
    await $("#username").setValue(`e2ereserved${Date.now()}`);
    await $("#register-submit-btn").click();
    await expect($("#register-success")).toBeDisplayed();
  });

  it("the Check our beta agreement comes before the form, and says what's saved", async () => {
    await browser.url("/register/?code=abc");
    await expect($("#register-form")).not.toBeDisplayed();
    await expect($("#beta-agreement")).toHaveTextContent(expect.stringContaining("saved without your name or account"));

    await $("#beta-agreement-continue").click();
    await expect($("#beta-agreement")).not.toBeDisplayed();
    await expect($("#register-form")).toBeDisplayed();
    await expect($("#code")).toHaveValue("abc");
    await expect($("#email")).toBeFocused();
  });
});
