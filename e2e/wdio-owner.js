import { readFileSync } from "node:fs";
import { browser, expect } from "@wdio/globals";
import { OWNED_ORIGIN } from "./owned-route-url.js";
import { afterThisTest, browserFetch, settle, userContextPartition, waitForPath } from "./wdio-browser.js";
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
  await browser.storageSetCookie({
    cookie: {
      name: cookie.name,
      value: { type: "string", value: cookie.value },
      domain,
      path: "/",
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite?.toLowerCase() ?? "lax",
    },
    partition: await userContextPartition(),
  });
}

async function signIn(poolPath, nextPath) {
  const { username, cookie } = claimFrom(poolPath, nextPath);
  const signInAgain = () => setSessionCookie(cookie, "my.localhost");
  await signInAgain();
  return { ...createOwner(username, cookie), signInAgain };
}

export async function signInDevUser(domain = "localhost") {
  const [cookie] = JSON.parse(readFileSync(STORAGE_STATE_PATH, "utf8")).cookies;
  await setSessionCookie(cookie, domain);
}

export async function updateDevUserSettings(fields) {
  const res = await browserFetch(`${OWNED_ORIGIN}/-/api/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`updating the dev user's settings: ${res.status}`);
}

export async function devUserAsAthlete() {
  await updateDevUserSettings({ athleteMode: true });
  afterThisTest(() => updateDevUserSettings({ athleteMode: false }));
}

export const claimOwner = () => signIn(OWNER_POOL_PATH, OWNER_NEXT_PATH);
export const claimNewOwner = () => signIn(NEW_OWNER_POOL_PATH, NEW_OWNER_NEXT_PATH);

export async function gotoSyncedLog(owner) {
  await browser.url(owner.url(`/sync?returnTo=${encodeURIComponent(`/${owner.username}/log`)}`));
  await waitForPath(`/${owner.username}/log`);
  await expect($("climbing-entries-table")).toBeDisplayed();
  const settingsKey = `logbook_settings_cache:${owner.username}`;
  await browser.waitUntil(() => browser.execute(key => localStorage.getItem(key) !== null, settingsKey));
  await settle();
}
