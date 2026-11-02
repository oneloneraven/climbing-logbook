import { readFileSync } from "node:fs";
import { browser, expect } from "@wdio/globals";
import { STORAGE_STATE_PATH } from "./global-setup.js";
import {
  claimFrom,
  createOwner,
  NEW_OWNER_NEXT_PATH,
  NEW_OWNER_POOL_PATH,
  OWNER_NEXT_PATH,
  OWNER_POOL_PATH,
} from "./owner.js";

// WebdriverIO's setCookies picks partitions that Chrome rejects or Firefox misfiles, so set it in the test's user context.
async function setSessionCookie(cookie, domain) {
  const context = browser.__parallelContextStore?.getStore();
  if (!context) throw new Error("Signing in needs WebdriverIO's userContexts parallel mode");
  const { contexts } = await browser.browsingContextGetTree({ root: context, maxDepth: 0 });
  await browser.storageSetCookie({
    cookie: {
      name: cookie.name,
      value: { type: "string", value: cookie.value },
      domain,
      path: "/",
      httpOnly: cookie.httpOnly,
      sameSite: "lax",
    },
    partition: { type: "storageKey", userContext: contexts[0].userContext },
  });
}

async function signIn(poolPath, nextPath) {
  const { username, cookie } = claimFrom(poolPath, nextPath);
  await setSessionCookie(cookie, "my.localhost");
  return createOwner(username, cookie);
}

export async function signInDevUser(domain = "localhost") {
  const [cookie] = JSON.parse(readFileSync(STORAGE_STATE_PATH, "utf8")).cookies;
  await setSessionCookie(cookie, domain);
}

export const claimOwner = () => signIn(OWNER_POOL_PATH, OWNER_NEXT_PATH);
export const claimNewOwner = () => signIn(NEW_OWNER_POOL_PATH, NEW_OWNER_NEXT_PATH);

export async function gotoSyncedLog(owner) {
  await browser.url(owner.url(`/sync?returnTo=${encodeURIComponent(`/${owner.username}/log`)}`));
  await browser.waitUntil(async () => new URL(await browser.getUrl()).pathname === `/${owner.username}/log`);
  await expect($("climbing-entries-table")).toBeDisplayed();
  const settingsKey = `logbook_settings_cache:${owner.username}`;
  await browser.waitUntil(() => browser.execute(key => localStorage.getItem(key) !== null, settingsKey));
}
