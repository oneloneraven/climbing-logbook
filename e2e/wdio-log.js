import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

export const SEED = {
  entries: [
    {
      id: "e1",
      placeId: "p1",
      type: "boulder",
      status: "send",
      grade: "6A",
      gradeScale: "font",
      date: "2026-05-01",
      name: "Boulder Seed",
    },
    {
      id: "e2",
      placeId: "p1",
      type: "sport",
      status: "send",
      grade: "6a",
      gradeScale: "french",
      date: "2026-05-02",
      name: "Sport Seed",
      sportStyle: "lead",
    },
  ],
  places: [{ id: "p1", locationId: "l1", area: "" }],
  locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
};

export async function gotoLog({ settings, ...data } = SEED) {
  const owner = await claimOwner();
  if (settings) await owner.settings(settings);
  await owner.seed(data);
  await gotoSyncedLog(owner);
  return owner;
}
