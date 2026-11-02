import { browser, expect } from "@wdio/globals";
import {
  claimFrom,
  createOwner,
  NEW_OWNER_NEXT_PATH,
  NEW_OWNER_POOL_PATH,
  OWNER_NEXT_PATH,
  OWNER_POOL_PATH,
} from "./owner.js";

async function signIn(poolPath, nextPath) {
  const { username, cookie } = claimFrom(poolPath, nextPath);
  await browser.storageSetCookie({
    cookie: {
      name: cookie.name,
      value: { type: "string", value: cookie.value },
      domain: "my.localhost",
      path: "/",
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite?.toLowerCase() ?? "lax",
    },
  });
  return createOwner(username, cookie);
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
