import { env } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { emailSend, sentEmails } from "./fake-email.js";
import { fetchJson, jsonRequest, resetAuthTables } from "./support.js";
import { createEmailSender } from "../server/lib/email.js";
import { TERMS_VERSION } from "../shared/terms.js";

beforeEach(resetAuthTables);

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});

const SIGNUP = {
  email: "nix@example.com",
  password: "correct-horse-battery-staple",
  name: "Nix",
  username: "nix",
  turnstileToken: "test-token",
  agreedTermsVersion: TERMS_VERSION,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async input => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("https://challenges.cloudflare.com/turnstile/")) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch to ${url} -- only Turnstile calls should reach real fetch() in this test file`);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function signUp(body = SIGNUP) {
  return jsonRequest("POST", "/-/api/auth/sign-up/email", body);
}

describe("sign-up with email verification required", () => {
  it("does not return a session, and sends a verification email", async () => {
    const res = await signUp();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeNull();
    expect(body.user.email).toBe(SIGNUP.email);

    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(sentEmails()[0].to).toEqual(SIGNUP.email);
    expect(sentEmails()[0].subject).toMatch(/verify/i);
    expect(sentEmails()[0].html).toContain("/-/api/auth/verify-email?token=");
  });

  it("rejects sign-in before the email is verified", async () => {
    await signUp();
    const res = await jsonRequest("POST", "/-/api/auth/sign-in/email", {
      email: SIGNUP.email,
      password: SIGNUP.password,
    });
    expect(res.status).toBe(403);
  });

  it("verifies via the emailed token and auto-signs-in", async () => {
    await signUp();
    const token = extractToken(sentEmails()[0].html, "token=");

    const res = await fetchJson(`/-/api/auth/verify-email?token=${token}`);
    expect([200, 302]).toContain(res.status);

    const cookie = res.headers.get("set-cookie");
    expect(cookie).toBeTruthy();

    const sessionRes = await fetchJson("/-/api/auth/get-session", { headers: { Cookie: cookie.split(";")[0] } });
    expect((await sessionRes.json()).user.email).toBe(SIGNUP.email);
  });
});

describe("password reset", () => {
  it("sends a reset email and the token round-trips to a new password", async () => {
    await signUp();
    emailSend.mockClear(); // only care about the reset email from here

    const reqRes = await jsonRequest("POST", "/-/api/auth/request-password-reset", {
      email: SIGNUP.email,
      turnstileToken: "t",
    });
    expect(reqRes.status).toBe(200);
    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(sentEmails()[0].subject).toMatch(/reset/i);

    const token = extractToken(sentEmails()[0].html, "reset-password/");
    const resetRes = await jsonRequest("POST", "/-/api/auth/reset-password", {
      newPassword: "a-brand-new-password",
      token,
    });
    expect(resetRes.status).toBe(200);

    const oldPasswordRes = await jsonRequest("POST", "/-/api/auth/sign-in/email", {
      email: SIGNUP.email,
      password: SIGNUP.password,
    });
    expect(oldPasswordRes.status).not.toBe(200);

    const newPasswordRes = await jsonRequest("POST", "/-/api/auth/sign-in/email", {
      email: SIGNUP.email,
      password: "a-brand-new-password",
    });
    expect(newPasswordRes.status).toBe(403); // still unverified -- correct password, but sign-in itself requires verification (see above)
  });

  it("rejects a reused reset token", async () => {
    await signUp();
    emailSend.mockClear();
    await jsonRequest("POST", "/-/api/auth/request-password-reset", { email: SIGNUP.email, turnstileToken: "t" });
    const token = extractToken(sentEmails()[0].html, "reset-password/");

    expect(
      (await jsonRequest("POST", "/-/api/auth/reset-password", { newPassword: "first-new-password", token })).status,
    ).toBe(200);
    const secondAttempt = await jsonRequest("POST", "/-/api/auth/reset-password", {
      newPassword: "second-new-password",
      token,
    });
    expect(secondAttempt.status).not.toBe(200);
  });

  it("rejects an unknown token", async () => {
    const res = await jsonRequest("POST", "/-/api/auth/reset-password", {
      newPassword: "whatever",
      token: "not-a-real-token",
    });
    expect(res.status).not.toBe(200);
  });
});

function extractToken(html, marker) {
  const match = html.match(new RegExp(`${marker}([^"&<?]+)`));
  if (!match) throw new Error(`Couldn't find a token in the emailed HTML: ${html}`);
  return decodeURIComponent(match[1]);
}

describe("createEmailSender HTML escaping (defense in depth, #754)", () => {
  const sender = createEmailSender(env);

  it("escapes HTML metacharacters in newEmail before interpolating into the change-email confirmation", async () => {
    await sender.sendChangeEmailConfirmation(
      "owner@example.com",
      "<img src=x onerror=alert(1)>",
      "https://example.com/confirm?token=abc",
    );
    const html = sentEmails()[0].html;
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("escapes HTML metacharacters in a malicious url before interpolating into href/link text", async () => {
    const maliciousUrl = 'https://example.com/"><script>alert(1)</script>';
    await sender.sendVerificationEmail("owner@example.com", maliciousUrl);
    const html = sentEmails()[0].html;
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("createEmailSender parts (#1106)", () => {
  const sender = createEmailSender(env);
  const url = "https://my.climbinglogbook.com/-/api/auth/verify-email?token=abc";

  it.each([
    ["verification", () => sender.sendVerificationEmail("owner@example.com", url)],
    ["password reset", () => sender.sendPasswordResetEmail("owner@example.com", url)],
    ["email change", () => sender.sendChangeEmailConfirmation("owner@example.com", "new@example.com", url)],
  ])("sends the %s email with a plain-text part and an HTML part", async (_name, sendIt) => {
    await sendIt();
    const { html, text } = sentEmails()[0];
    expect(html).toContain(`href="${url}"`);
    expect(text).toContain(url);
    expect(text).not.toMatch(/<[a-z]/i);
  });

  it("keeps every style attribute whole, so a quote in a font name can't cut it short", async () => {
    await sender.sendVerificationEmail("owner@example.com", url);
    const { html } = sentEmails()[0];
    const opened = html.match(/style="/g).length;
    const whole = html.match(/style="[^"]*"(?=[\s>])/g).length;
    expect(whole).toBe(opened);
  });

  it("says in both parts that replies aren't read, and where to get help (#1365)", async () => {
    await sender.sendVerificationEmail("owner@example.com", url);
    const help = `Replies to this address aren't read. For help, email ${["hello", "climbinglogbook.com"].join("@")}.`;
    expect(sentEmails()[0].text).toContain(help);
    expect(sentEmails()[0].html).toContain(help.replace("aren't", "aren&#39;t"));
  });

  it("names the new address in both parts of the email change", async () => {
    await sender.sendChangeEmailConfirmation("owner@example.com", "new@example.com", url);
    expect(sentEmails()[0].text).toContain("new@example.com");
    expect(sentEmails()[0].html).toContain("new@example.com");
  });

  it("loads the brand image from the link's own origin, and falls back to text when the link has none", async () => {
    await sender.sendVerificationEmail("owner@example.com", url);
    expect(sentEmails()[0].html).toContain('src="https://my.climbinglogbook.com/-/email-lockup.png"');
    await sender.sendVerificationEmail("owner@example.com", "not a url");
    expect(sentEmails()[1].html).not.toContain("<img");
    expect(sentEmails()[1].html).toContain("CLIMBING LOGBOOK");
  });
});

describe("createEmailSender with delivery off (#1170)", () => {
  const sender = createEmailSender({ ...env, EMAIL_DELIVERY: "off" });

  it("never sends, for any kind of email", async () => {
    await sender.sendVerificationEmail("owner@example.com", "https://example.com/verify?token=abc");
    await sender.sendPasswordResetEmail("owner@example.com", "https://example.com/reset?token=abc");
    await sender.sendChangeEmailConfirmation("owner@example.com", "new@example.com", "https://example.com/c?t=abc");
    expect(emailSend).not.toHaveBeenCalled();
  });
});

describe("createEmailSender with delivery logged (#1357)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prints the link in local dev instead of sending", async () => {
    const print = vi.spyOn(console, "log").mockImplementation(() => {});
    const sender = createEmailSender({ ...env, APP_ENV: "development", EMAIL_DELIVERY: "log" });

    await sender.sendVerificationEmail("owner@example.com", "https://example.com/verify?token=abc");

    expect(emailSend).not.toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith(
      "Email to owner@example.com: Verify your email\n  https://example.com/verify?token=abc",
    );
  });

  it("drops the email, without printing its link, anywhere but local dev", async () => {
    const print = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const sender = createEmailSender({ ...env, APP_ENV: "production", EMAIL_DELIVERY: "log" }, log);

    await sender.sendPasswordResetEmail("owner@example.com", "https://example.com/reset?token=abc");

    expect(emailSend).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith("email.skipped", { reason: "log delivery outside development" });
  });
});

describe("2FA recovery emails (#1436)", () => {
  const sender = () => createEmailSender(env);
  const sent = () => sentEmails().at(-1);

  it("explains the wait in the recovery link email", async () => {
    await sender().sendTwoStepRecoveryLink("nix@example.com", "https://climbinglogbook.com/login/?two-step-recovery=t");
    expect(sent().subject).toBe("Switch off 2FA?");
    expect(sent().text).toContain("7 days after you do");
    expect(sent().html).toContain("two-step-recovery=t");
  });

  it("gives the switch-off date and a cancel link when the wait starts", async () => {
    await sender().sendTwoStepRecoveryStarted(
      "nix@example.com",
      Date.UTC(2026, 9, 25),
      "https://climbinglogbook.com/x",
    );
    expect(sent().text).toContain("Sunday, 25 October 2026");
    expect(sent().html).toContain("This wasn&#39;t me: cancel it");
  });

  it("links to Help when it's cancelled or done", async () => {
    await sender().sendTwoStepRecoveryCancelled(
      "nix@example.com",
      "https://climbinglogbook.com/help/two-factor-authentication/",
    );
    expect(sent().subject).toBe("2FA stays on");
    await sender().sendTwoStepSwitchedOff(
      "nix@example.com",
      "https://climbinglogbook.com/help/two-factor-authentication/",
    );
    expect(sent().subject).toBe("2FA is off");
    expect(sent().html).toContain("/help/two-factor-authentication/");
  });
});

describe("passkey emails (#1439)", () => {
  it("tells the owner when a passkey is added, with a link to their passkeys", async () => {
    await createEmailSender(env).sendAccountNotice("nix@example.com", "passkeyAdded", {
      url: "https://my.climbinglogbook.com/nix/account/authentication",
    });
    const { subject, html } = sentEmails().at(-1);
    expect(subject).toBe("A passkey was added to your account");
    expect(html).toContain("https://my.climbinglogbook.com/nix/account/authentication");
  });
});

describe("sending through the Email Sending binding (#1702)", () => {
  const FROM = "Climbing Logbook <myaccount@climbinglogbook.com>";
  const to = "owner@example.com";
  const url = "https://example.com/x?token=abc";
  const senders = {
    sendVerificationEmail: [s => s.sendVerificationEmail(to, url), "Verify your email"],
    sendPasswordResetEmail: [s => s.sendPasswordResetEmail(to, url), "Reset your password"],
    sendChangeEmailConfirmation: [
      s => s.sendChangeEmailConfirmation(to, "new@example.com", url),
      "Confirm your email change",
    ],
    sendAccountNotice: [s => s.sendAccountNotice(to, "passkeyAdded", { url }), "A passkey was added to your account"],
    sendTwoStepRecoveryLink: [s => s.sendTwoStepRecoveryLink(to, url), "Switch off 2FA?"],
    sendTwoStepRecoveryStarted: [
      s => s.sendTwoStepRecoveryStarted(to, Date.UTC(2026, 9, 25), url),
      "2FA will switch off in 7 days",
    ],
    sendTwoStepRecoveryCancelled: [s => s.sendTwoStepRecoveryCancelled(to, url), "2FA stays on"],
    sendTwoStepSwitchedOff: [s => s.sendTwoStepSwitchedOff(to, url), "2FA is off"],
  };

  for (const [method, [send, subject]] of Object.entries(senders)) {
    it(`${method} calls EMAIL.send once, with the sender, recipient, subject, and both html and text`, async () => {
      await send(createEmailSender(env));

      expect(emailSend).toHaveBeenCalledTimes(1);
      expect(emailSend).toHaveBeenCalledWith({
        from: FROM,
        to,
        subject,
        html: expect.stringContaining("<"),
        text: expect.stringMatching(/\S/),
      });
    });
  }

  it("logs a rejected send by its code alone, never the address or the error's message", async () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    emailSend.mockRejectedValue(
      Object.assign(new Error(`Daily limit reached sending to ${to}`), { code: "E_DAILY_LIMIT_EXCEEDED" }),
    );

    await expect(createEmailSender(env, log).sendVerificationEmail(to, url)).resolves.toBeUndefined();

    expect(log.error).toHaveBeenCalledOnce();
    expect(log.error).toHaveBeenCalledWith("email.failed", { code: "E_DAILY_LIMIT_EXCEEDED" });
  });

  it("logs an error with no code as unknown, and still doesn't throw", async () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    emailSend.mockRejectedValue(new Error("boom"));
    await createEmailSender(env, log).sendVerificationEmail(to, url);
    emailSend.mockRejectedValue(undefined);
    await createEmailSender(env, log).sendVerificationEmail(to, url);

    expect(log.error).toHaveBeenNthCalledWith(1, "email.failed", { code: "E_UNKNOWN" });
    expect(log.error).toHaveBeenNthCalledWith(2, "email.failed", { code: "E_UNKNOWN" });
  });

  it("lets sign-up succeed when the daily limit stops the email, and logs only the code", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    emailSend.mockRejectedValue(Object.assign(new Error("Daily limit reached"), { code: "E_DAILY_LIMIT_EXCEEDED" }));

    const res = await signUp();

    expect(res.status).toBe(200);
    expect((await res.json()).user.email).toBe(SIGNUP.email);
    const logged = errors.mock.calls.map(([line]) => String(line));
    expect(
      logged.some(line => line.includes('"event":"email.failed"') && line.includes("E_DAILY_LIMIT_EXCEEDED")),
    ).toBe(true);
    expect(logged.join("\n")).not.toContain(SIGNUP.email);
    errors.mockRestore();
  });
});
