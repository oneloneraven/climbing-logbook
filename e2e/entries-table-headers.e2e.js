import { $, $$, expect } from "@wdio/globals";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

const openGroup = () => $("[data-location-id]:has(> .place-header + :not(.hidden))");

// Browsers disagree on whether the headers' uppercase styling is part of the name, so match on the text.
async function columnHeader(name) {
  for (const header of await openGroup().$$("role/columnheader")) {
    if ((await header.getProperty("textContent")).includes(name)) return header;
  }
  throw new Error(`No column header for ${name}`);
}

describe("entries table headers", () => {
  it("every column header is a named column header, and sortable ones sort through a button", async () => {
    const owner = await claimOwner();
    await owner.seed({ entries: [{ name: "Alpha" }, { name: "Bravo" }] });
    await gotoSyncedLog(owner);
    await $$(".place-header")[0].click();

    const headers = openGroup().$$("role/columnheader");
    await expect(headers).toBeElementsArrayOfSize(7);
    for (const header of await headers) {
      expect((await header.getProperty("textContent")).trim()).not.toBe("");
    }

    for (const name of ["Grd", "Name", "Area", "Date"]) {
      const button = (await columnHeader(name)).$("role/button");
      await expect(button).toBeDisplayed();
      await expect(button).toHaveTextContent(expect.stringContaining(name));
    }

    await expect(await columnHeader("Name")).toHaveAttribute("aria-sort", "none");
    await (await columnHeader("Name")).$("role/button").click();
    await expect(await columnHeader("Name")).toHaveAttribute("aria-sort", "ascending");
    await (await columnHeader("Name")).$("role/button").click();
    await expect(await columnHeader("Name")).toHaveAttribute("aria-sort", "descending");
    await expect((await columnHeader("Name")).$("role/button")).toBeFocused();
  });

  it("the filter button says whether filters are applied, without aria-pressed", async () => {
    const owner = await claimOwner();
    await owner.seed({ entries: [{ name: "Alpha" }] });
    await gotoSyncedLog(owner);

    const filter = $("#filter-btn");
    await expect(filter).not.toHaveAttribute("aria-pressed");
    await expect($(".filter-wrap").$('role/button[name="Filter"]')).toHaveId("filter-btn");

    await filter.click();
    await expect(filter).toHaveAttribute("aria-expanded", "true");
    await $('#filter-status-group label:has(input[data-filter="archived"])').click();
    await expect($(".filter-wrap").$('role/button[name="Filter, filters applied"]')).toHaveId("filter-btn");
    await expect(filter).not.toHaveAttribute("aria-pressed");
  });
});
