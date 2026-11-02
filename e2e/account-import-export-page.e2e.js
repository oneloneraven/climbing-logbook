import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { CSV_COLUMNS } from "../shared/csv-import.js";
import { captureDownloads, chooseFile, temporaryFolder, expectEventually, textContents } from "./wdio-browser.js";
import { claimOwner } from "./wdio-owner.js";

const csv = (...rows) =>
  [CSV_COLUMNS, ...rows].map(cells => `${CSV_COLUMNS.map((_, i) => cells[i] ?? "").join(",")}\n`).join("");
const row = (name, grade, location) => [
  name,
  grade,
  "boulder",
  "send",
  "true",
  "2026-07-30",
  location,
  "Sector 1",
  "United Kingdom",
];
const VALID_CSV = csv(row("Test Route", "6B", "Test Crag"));

async function openImportExport() {
  const owner = await claimOwner();
  await browser.url(owner.url("/account/import-export"));
  return owner;
}

async function choose(name, contents) {
  const file = join(temporaryFolder(), name);
  writeFileSync(file, contents);
  await chooseFile($("#import-file-input"), file);
}

async function submitImport() {
  const imported = await browser.mock("**/-/api/entries/import", { method: "POST" });
  await $("#import-submit-btn").click();
  await imported.waitForResponse();
  return imported;
}

const EXPORT_FIXTURE = {
  locations: [{ id: "l1", name: "Fontainebleau", country: "France" }],
  places: [{ id: "p1", locationId: "l1", area: "Bas Cuvier" }],
  entries: [{ name: "La Marie-Rose", grade: "6B", firstAttempt: true, date: "2026-07-30" }],
};

async function download(button) {
  const owner = await claimOwner();
  await owner.seed(EXPORT_FIXTURE);
  const downloads = await captureDownloads();
  await browser.url(owner.url("/account/import-export"));
  await $(button).click();
  return downloads.next();
}

describe("account import and export", () => {
  it("downloads the CSV template client-side, no network request", async () => {
    const downloads = await captureDownloads();
    await openImportExport();

    await $("#download-template-btn").click();
    expect((await downloads.next()).name).toBe("climbing-logbook-import-template.csv");
  });

  it("uploads a valid CSV and shows the success summary", async () => {
    await openImportExport();

    await choose("import.csv", VALID_CSV);
    await submitImport();

    await expect($("#import-success")).toBeDisplayed();
    await expect($("#import-success-message")).toHaveTextContent("Imported 1 entry.");
    await expect($("#import-errors")).not.toBeDisplayed();
  });

  it("uploads a valid JSON export and shows the success summary, with the right Content-Type", async () => {
    await openImportExport();

    await choose(
      "export.json",
      JSON.stringify([
        {
          name: "Test Route",
          grade: "6B",
          discipline: "boulder",
          status: "send",
          firstAttempt: true,
          date: "2026-07-30",
          location: "Test Crag",
          area: "Sector 1",
          country: "United Kingdom",
          video: "",
          notes: "",
          sportStyle: "",
        },
      ]),
    );
    const imported = await submitImport();

    const contentType = imported.calls[0].request.headers.find(h => h.name.toLowerCase() === "content-type");
    expect(contentType.value.value).toBe("application/json");
    await expect($("#import-success")).toBeDisplayed();
    await expect($("#import-success-message")).toHaveTextContent("Imported 1 entry.");
  });

  it("shows every row's error at once when the server rejects the file", async () => {
    await openImportExport();

    await choose("bad-import.csv", csv(row("No Location", "6B", ""), row("Bad Grade", "99Z", "Test Crag")));
    await submitImport();

    await expect($("#import-errors")).toBeDisplayed();
    await expectEventually(
      () => textContents("#import-errors-list li"),
      [expect.stringMatching(/^Row 2: .*location/), expect.stringMatching(/^Row 3: .*grade/)],
    );
    await expect($("#import-success")).not.toBeDisplayed();
  });

  it("a structural error (e.g. bad header) shows as a single-item list, same panel", async () => {
    await openImportExport();

    await choose("empty.csv", "");
    await submitImport();

    await expectEventually(() => textContents("#import-errors-list li"), ["CSV file is empty."]);
  });

  it("back-to-account-link is built from this page's own URL", async () => {
    const owner = await openImportExport();

    await expect($("#back-to-account-link")).toHaveAttribute("href", `/${owner.username}/account`);
  });

  it("Export CSV downloads a file built from this user's own entries/places/locations", async () => {
    const file = await download("#export-csv-btn");
    expect(file.name).toBe("climbing-logbook-export.csv");
    expect(file.text()).toContain("name,grade,discipline,status,firstAttempt,date,location,area,country,video,notes");
    expect(file.text()).toContain("La Marie-Rose,6B,boulder,send,true,2026-07-30,Fontainebleau,Bas Cuvier,France,,");
  });

  it("Export JSON downloads the resolved rows as JSON", async () => {
    const file = await download("#export-json-btn");
    expect(file.name).toBe("climbing-logbook-export.json");
    expect(JSON.parse(file.text())).toEqual([
      {
        name: "La Marie-Rose",
        grade: "6B",
        discipline: "boulder",
        status: "send",
        firstAttempt: true,
        date: "2026-07-30",
        location: "Fontainebleau",
        area: "Bas Cuvier",
        country: "France",
        video: "",
        notes: "",
        sportStyle: "",
        attemptsToSend: "",
        rpe: "",
        gradeScale: "font-non-standard",
      },
    ]);
  });

  it("Export shows an error message instead of a download when the data fetch fails", async () => {
    const owner = await claimOwner();
    await owner.seed(EXPORT_FIXTURE);
    const entries = await browser.mock("**/-/api/entries*");
    entries.respond("", { statusCode: 500, fetchResponse: false });
    await browser.url(owner.url("/account/import-export"));

    await $("#export-csv-btn").click();
    await expect($("#export-error")).toBeDisplayed();
    await expect($("#export-error")).toHaveTextContent("Export failed -- check your connection and try again.");
  });
});
