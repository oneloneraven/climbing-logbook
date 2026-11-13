import { env } from "cloudflare:workers";
import { beforeEach, vi } from "vitest";

// Stands in for the Email Sending binding in every test, so nothing reaches Cloudflare: tests read what was sent.
export const emailSend = vi.fn();

export const sentEmails = () => emailSend.mock.calls.map(([payload]) => payload);

beforeEach(() => {
  emailSend.mockReset();
  emailSend.mockResolvedValue({ messageId: "test-message-id" });
  env.EMAIL = { send: emailSend };
});
