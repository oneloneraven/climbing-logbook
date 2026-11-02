import { createHash } from "node:crypto";
import { $, browser, expect } from "@wdio/globals";
import { d1Execute } from "../scripts/lib/dev-session.mjs";
import { claimOwner } from "./wdio-owner.js";

const D1 = { database: "climbing-logbook-preview", env: "preview" };

describe("two-step recovery", () => {
  it("a recovery link starts the 7-day wait, and can cancel it (#1436)", async () => {
    const owner = await claimOwner();
    await browser.url(owner.url("/account"));
    const { user } = await browser.execute(() => fetch("/-/api/auth/get-session").then(r => r.json()));
    const token = `e2e-${crypto.randomUUID()}`;
    const hash = createHash("sha256").update(token).digest("hex");
    d1Execute(
      `INSERT INTO two_step_recoveries (id, user_id, token_hash, origin, requested_at) VALUES ('${crypto.randomUUID()}', '${user.id}', '${hash}', 'http://localhost:8787', ${Date.now()})`,
      D1,
    );

    await browser.url(`/login/?two-step-recovery=${token}`);
    await expect($("#login-form")).not.toBeDisplayed();
    await expect($("#recovery-status")).toHaveTextContent("Someone asked to switch off 2FA on your account.");
    await $("#recovery-start-btn").click();
    await expect($("#recovery-status")).toHaveTextContent(expect.stringContaining("2FA switches off on"));

    await browser.url(owner.url("/account/authentication"));
    await expect($("#recovery-pending")).toBeDisplayed();

    await browser.url(`/login/?two-step-recovery=${token}`);
    await $("#recovery-cancel-btn").click();
    await expect($("#recovery-status")).toHaveTextContent("This was cancelled. 2FA stays on.");
  });
});
