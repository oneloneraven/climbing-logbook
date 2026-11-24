import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ENGAGE_SUBMISSIONS_URL,
  currentAccountRef,
  engageErrorMessage,
  engageSubmission,
  sendToEngage,
} from "../../client/engage-submission.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const REPORT = {
  kind: "issue",
  message: "The map pin popover doesn't close.",
  contactEmail: "climber@example.com",
  section: "map",
  sourcePage: "https://my.climbinglogbook.com/raven/map",
  appVersion: "v2.144.6",
  turnstileToken: "token",
  hpx: "",
  accountRef: "user-1",
  context: { reportedUsername: "nix", reportedEntryId: "entry-1", errorRef: "abc-123" },
};

describe("engageSubmission", () => {
  it("builds an issue report for Engage, with its context and account", () => {
    expect(engageSubmission(REPORT)).toEqual({
      product: "cl",
      kind: "issue",
      source: "web",
      message: "The map pin popover doesn't close.",
      contactEmail: "climber@example.com",
      sourcePage: "https://my.climbinglogbook.com/raven/map",
      section: "map",
      appVersion: "2.144.6",
      turnstileToken: "token",
      hpx: undefined,
      accountRef: "user-1",
      context: { reportedUsername: "nix", reportedEntryId: "entry-1", errorRef: "abc-123" },
    });
  });

  it("builds feedback with no context, consent or credit, so Engage never quotes it", () => {
    const body = JSON.parse(
      JSON.stringify(
        engageSubmission({ kind: "feedback", message: "Love it.", turnstileToken: "token", accountRef: "user-1" }),
      ),
    );
    expect(body).toEqual({
      product: "cl",
      kind: "feedback",
      source: "web",
      message: "Love it.",
      turnstileToken: "token",
      accountRef: "user-1",
    });
  });

  it("leaves out blank fields, so JSON drops them", () => {
    const body = JSON.parse(
      JSON.stringify(
        engageSubmission({ ...REPORT, contactEmail: "", section: "", accountRef: undefined, context: {} }),
      ),
    );
    expect(body).not.toHaveProperty("contactEmail");
    expect(body).not.toHaveProperty("section");
    expect(body).not.toHaveProperty("accountRef");
    expect(body).not.toHaveProperty("context");
  });

  it("passes on a filled honeypot", () => {
    expect(engageSubmission({ ...REPORT, hpx: "spam" }).hpx).toBe("spam");
  });

  it.each([
    ["v2.144.6", "2.144.6"],
    ["dev", undefined],
    [undefined, undefined],
  ])("sends app version %s as %s", (appVersion, expected) => {
    expect(engageSubmission({ ...REPORT, appVersion }).appVersion).toBe(expected);
  });

  it.each([
    ["one of our pages", "https://climbinglogbook.com/help/", "https://climbinglogbook.com/help/"],
    ["someone else's page", "https://example.com/climbinglogbook.com", undefined],
    ["a lookalike host", "https://notclimbinglogbook.com/", undefined],
    ["a non-web address", "javascript:alert(1)", undefined],
    ["one longer than Engage takes", `https://climbinglogbook.com/${"a".repeat(480)}`, undefined],
    ["no referrer", undefined, undefined],
  ])("keeps the source page only when it's %s", (_case, sourcePage, expected) => {
    expect(engageSubmission({ ...REPORT, sourcePage }).sourcePage).toBe(expected);
  });

  it("trims context, and drops values that are empty or longer than Engage takes", () => {
    const { context } = engageSubmission({
      ...REPORT,
      context: { reportedUsername: "  nix  ", reportedEntryId: "x".repeat(65), errorRef: undefined },
    });
    expect(context).toEqual({ reportedUsername: "nix" });
  });
});

describe("sendToEngage", () => {
  it("posts the submission to Engage as JSON", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    const submission = engageSubmission(REPORT);

    await sendToEngage(submission);

    expect(fetch).toHaveBeenCalledWith(ENGAGE_SUBMISSIONS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission),
    });
  });
});

describe("currentAccountRef", () => {
  it("is the signed-in user's id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ user: { id: "user-1", username: "raven" } })),
    );
    expect(await currentAccountRef()).toBe("user-1");
    expect(fetch).toHaveBeenCalledWith("/-/api/auth/get-session", { signal: expect.any(AbortSignal) });
  });

  it.each([
    ["signed out", async () => Response.json(null)],
    ["the session check fails", async () => new Response("nope", { status: 500 })],
    ["the network fails", async () => Promise.reject(new TypeError("offline"))],
  ])("is nothing when %s", async (_case, respond) => {
    vi.stubGlobal("fetch", vi.fn(respond));
    expect(await currentAccountRef()).toBeUndefined();
  });
});

describe("engageErrorMessage", () => {
  const messages = { tooMany: "Too many.", empty: "Fill it in.", fallback: "Couldn't send (500)." };

  it.each([
    [429, { error: "rate-limited" }, "Too many."],
    [400, { error: "verification-failed" }, "Bot verification failed. Please try again."],
    [400, { error: "invalid-submission", fields: ["contactEmail"] }, "Enter a valid email address, or leave it blank."],
    [400, { error: "invalid-submission", fields: ["message"] }, "Fill it in."],
    [400, { error: "invalid-submission", fields: ["context"] }, "Couldn't send (500)."],
    [500, null, "Couldn't send (500)."],
  ])("for %s %j says %s", (status, data, expected) => {
    expect(engageErrorMessage(status, data, messages)).toBe(expected);
  });
});
