import { $, $$, browser, expect } from "@wdio/globals";
import { expectEventually, recordFetches, textContents } from "./wdio-browser.js";
import { gotoLog, SEED } from "./wdio-log.js";
import { claimOwner, gotoSyncedLog } from "./wdio-owner.js";

const contains = text => expect.stringContaining(text);
const ATHLETE = { ...SEED, settings: { athleteMode: true, activeDiscipline: "boulder" } };
const ACTIVE_CLASS = "bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)]";

const editRow = name => $(`//tr[.//*[normalize-space(text())=${JSON.stringify(name)}]]`).$(".edit-btn");
const option = (listbox, text) => $(`${listbox}`).$(`[role="option"]*=${text}`);

async function choosePlace(owner, id = "p1") {
  await $("#place-btn").click();
  await $(`#place-listbox li[data-key="${owner.ownId(id)}"]`).click();
}

async function chooseDiscipline(discipline) {
  await $("#discipline-btn").click();
  await $(`.discipline-option[data-discipline="${discipline}"]`).click();
}

async function chooseStatus(status) {
  const radio = $(`#status-group input[value="${status}"]`);
  for (let step = 0; step < 5 && !(await radio.isSelected()); step++) {
    await $('.status-picker-arrow[data-step="1"]').click();
  }
  await expect(radio).toBeSelected();
}

const expectInert = async (id, inert) => expect($(`#${id}`)).toHaveElementProperty("inert", inert);

describe("log entry form", () => {
  it("adds and then deletes an entry via the Add/Edit modal", async () => {
    const fetches = await recordFetches();
    const owner = await gotoLog();
    const entryName = `E2E log-page test ${Date.now()}`;
    await $("#add-btn").click();
    await expect($("#entry-overlay")).toBeDisplayed();
    await $("#entry-name").setValue(entryName);
    await choosePlace(owner);
    const added = fetches.next("/-/api/entries", "POST");
    await $("#entry-submit-btn").click();
    await added;
    await expect($("#entry-overlay")).not.toBeDisplayed();
    await expect($("#sections")).toHaveTextContent(contains(entryName));

    await $("#collapse-all-btn").click();
    await editRow(entryName).click();
    await expect($("#entry-delete-btn")).toBeDisplayed();

    browser.once("dialog", dialog => dialog.accept());
    const deleted = fetches.next("/-/api/entries", "DELETE");
    await $("#entry-delete-btn").click();
    await deleted;
    await expect($("#entry-overlay")).not.toBeDisplayed();
    await expect($("#sections")).not.toHaveTextContent(contains(entryName));
  });

  it("the climb's name opens its editor, by click or keyboard, and there's no separate edit column (#1491)", async () => {
    await browser.setViewport({ width: 312, height: 700 });
    await gotoLog();
    await $("#collapse-all-btn").click();

    const nameButton = () => $('role/button[name="Edit Boulder Seed"]');
    await expect(nameButton().$(".font-medium")).toHaveTextContent("Boulder Seed");
    await expect($("//th[contains(., 'Edit')]")).not.toExist();

    await nameButton().click();
    await expect($("#entry-overlay")).toBeDisplayed();
    await expect($("#entry-name")).toHaveValue("Boulder Seed");
    await $("#entry-close").click();
    await expect($("#entry-overlay")).not.toBeDisplayed();

    await browser.execute(button => button.focus(), await nameButton());
    await browser.keys("Enter");
    await expect($("#entry-overlay")).toBeDisplayed();
    await expect($("#entry-name")).toHaveValue("Boulder Seed");
    await $("#entry-close").click();
  });

  it("date picker: opens on the field's current month, navigates, selects a day, and re-syncs on reopen", async () => {
    await gotoLog();
    await $("#add-btn").click();
    await expect($("#entry-overlay")).toBeDisplayed();

    await $("#entry-date").setValue("2026-08-15");
    await $("#date-picker-btn").click();
    await expect($("#date-picker-popover")).toBeDisplayed();
    await expect($("#date-picker-month-label")).toHaveTextContent("August 2026");
    await expect($('#date-picker-grid button[data-date="2026-08-15"]')).toHaveAttribute("aria-selected", "true");

    await $("#date-picker-next-month").click();
    await expect($("#date-picker-month-label")).toHaveTextContent("September 2026");
    await expect($$('#date-picker-grid button[aria-selected="true"]')).toBeElementsArrayOfSize(0);

    await $("#date-picker-prev-month").click();
    await expect($("#date-picker-month-label")).toHaveTextContent("August 2026");
    await $('#date-picker-grid button[data-date="2026-08-03"]').click();
    await expect($("#date-picker-popover")).not.toBeDisplayed();
    await expect($("#entry-date")).toHaveValue("2026-08-03");

    await $("#date-picker-btn").click();
    await expect($("#date-picker-month-label")).toHaveTextContent("August 2026");
    await expect($('#date-picker-grid button[data-date="2026-08-03"]')).toHaveAttribute("aria-selected", "true");
  });

  it("Style control is hidden for Boulder, shown+required for Sport, and pre-fills on edit", async () => {
    const fetches = await recordFetches();
    const owner = await gotoLog();

    await $("#add-btn").click();
    await expect($("#entry-overlay")).toBeDisplayed();
    await expect($("#sport-style-field")).not.toBeDisplayed();
    await $("#entry-close").click();

    await chooseDiscipline("sport");
    await $("#add-btn").click();
    await expect($("#sport-style-field")).toBeDisplayed();
    await expect($('#sport-style-group input[value="lead"]')).toBeSelected();

    const entryName = `E2E sport-style test ${Date.now()}`;
    await $("#entry-name").setValue(entryName);
    await choosePlace(owner);
    await browser.execute(radio => radio.click(), await $('#sport-style-group input[value="top_rope"]'));

    const posted = fetches.next("/-/api/entries", "POST");
    await $("#entry-submit-btn").click();
    expect(JSON.parse((await posted).body).sportStyle).toBe("top_rope");
    await expect($("#entry-overlay")).not.toBeDisplayed();

    await $("#collapse-all-btn").click();
    await editRow(entryName).click();
    await expect($("#sport-style-field")).toBeDisplayed();
    await expect($('#sport-style-group input[value="top_rope"]')).toBeSelected();
  });

  it("Attempts field's gap-view hint matches the active discipline's own status wording", async () => {
    await gotoLog(ATHLETE);

    await $("#add-btn").click();
    await $("#entry-nav-forward").click();
    await expect($("#attempts-gap-hint")).toHaveTextContent("Feeds your flash/send gap insights.");
    await $("#entry-close").click();

    await chooseDiscipline("sport");
    await $("#add-btn").click();
    await $("#entry-nav-forward").click();
    await expect($("#attempts-gap-hint")).toHaveTextContent("Feeds your onsight/redpoint gap insights.");
  });

  it("Style filter is hidden for Boulder, shown for Sport, and narrows the table", async () => {
    await gotoLog({
      ...SEED,
      entries: [
        ...SEED.entries,
        {
          id: "e3",
          placeId: "p1",
          type: "sport",
          status: "send",
          grade: "6b",
          date: "2026-05-03",
          name: "Top Rope Seed",
          sportStyle: "top_rope",
        },
      ],
    });
    const styleFilter = style => $(`#filter-sport-style-group input[data-sport-style="${style}"]`);

    await $("#filter-btn").click();
    await expect($("#filter-sport-style-wrap")).not.toBeDisplayed();
    await $("#filter-btn").click();

    await chooseDiscipline("sport");
    await expect($("#sections")).toHaveTextContent(contains("Sport Seed"));
    await expect($("#sections")).toHaveTextContent(contains("Top Rope Seed"));

    await $("#filter-btn").click();
    await expect($("#filter-sport-style-wrap")).toBeDisplayed();
    await expect(styleFilter("lead")).toBeSelected();
    await expect(styleFilter("top_rope")).toBeSelected();

    await $('#filter-sport-style-group label:has(input[data-sport-style="top_rope"])').click();
    await expect($("#sections")).toHaveTextContent(contains("Sport Seed"));
    await expect($("#sections")).not.toHaveTextContent(contains("Top Rope Seed"));
    await expect($$("#filter-btn.active")).toBeElementsArrayOfSize(1);

    await $("#filter-clear-btn").click();
    await expect($("#sections")).toHaveTextContent(contains("Top Rope Seed"));
    await expect(styleFilter("top_rope")).toBeSelected();
  });

  it("Exertion is visible for Send/Flash and hidden for Project/Check out/Archived", async () => {
    await gotoLog(ATHLETE);
    await $("#add-btn").click();
    await expect($("#entry-overlay")).toBeDisplayed();

    await $("#entry-nav-forward").click();
    await expect($("#exertion-field")).toBeDisplayed();

    for (const [status, shown] of [
      ["project", false],
      ["checkout", false],
      ["archived", false],
      ["flash", true],
    ]) {
      await $("#entry-nav-back").click();
      await chooseStatus(status);
      await $("#entry-nav-forward").click();
      if (shown) await expect($("#exertion-field")).toBeDisplayed();
      else await expect($("#exertion-field")).not.toBeDisplayed();
    }
  });

  it("Attempts stepper increments/decrements and cannot go below 0", async () => {
    await gotoLog(ATHLETE);
    await $("#add-btn").click();
    await expect($("#entry-overlay")).toBeDisplayed();
    await $("#entry-nav-forward").click();

    await expect($("#attempts-count")).toHaveValue("–");
    await expect($("#attempts-minus")).toBeDisabled();

    await $("#attempts-plus").click();
    await $("#attempts-plus").click();
    await expect($("#attempts-count")).toHaveValue("2");
    await expect($("#attempts-minus")).toBeEnabled();

    await $("#attempts-minus").click();
    await expect($("#attempts-count")).toHaveValue("1");
    await $("#attempts-minus").click();
    await expect($("#attempts-count")).toHaveValue("–");
    await expect($("#attempts-minus")).toBeDisabled();

    await $("#attempts-minus").click({ button: "left" });
    await expect($("#attempts-count")).toHaveValue("–");

    await $("#attempts-count").setValue("7");
    await expect($("#attempts-count")).toHaveValue("7");
    await expect($("#attempts-minus")).toBeEnabled();
  });

  it("the hardest move is read back as it's typed, and saved as written (#1522)", async () => {
    const fetches = await recordFetches();
    const owner = await gotoLog(ATHLETE);

    const entryName = `E2E hardest move ${Date.now()}`;
    await $("#add-btn").click();
    await $("#entry-name").setValue(entryName);
    await choosePlace(owner);

    await $("#entry-nav-forward").click();
    await expect($("#hardest-beta-reading")).not.toBeDisplayed();
    await $("#entry-hardest-beta").setValue("Right heel hook on the lip, jam in the crack, then dyno to the jugg");

    await expect($$("#hardest-beta-readback mark.beta-position")[0]).toHaveTextContent("heel hook");
    await $("#hardest-beta-chips").$("button*=jam?").click();
    await $("#hardest-beta-panel").$("button*=Jam (hand)").click();
    await $("#hardest-beta-chips").$("button*=jugg?").click();
    await $("#hardest-beta-panel").$("button*=Use “jug”").click();
    await expect($$("#hardest-beta-chips button")).toBeElementsArrayOfSize(0);

    await $("#entry-wall-angle").selectByAttribute("value", "vert");
    await expect($("#hardest-beta-angle-mismatch")).not.toBeDisplayed();
    await $("#hardest-beta-reading summary").click();
    await expectEventually(
      () => textContents("#hardest-beta-steps li"),
      ["Right foot: heel hook on a lip.", "Jam (hand) on a crack.", "Dyno to a jug."],
    );

    const posted = fetches.next("/-/api/entries", "POST");
    await $("#entry-submit-btn-2").click();
    const post = await posted;
    await expect($("#entry-overlay")).not.toBeDisplayed();

    expect(post.status).toBe(201);
    const submittedBody = JSON.parse(post.body);
    expect(submittedBody.name).toBe(entryName);
    expect(submittedBody.hardestBeta).toBe("Right heel hook on the lip, hand jam in the crack, then dyno to the jug");
    expect(submittedBody.wallAngle).toBe("vert");
    expect(submittedBody).not.toHaveProperty("moves");
  });

  it("in Athlete Mode a climb needs its wall angle, except a Checkout, which has no hardest move (#1523)", async () => {
    const fetches = await recordFetches();
    const owner = await gotoLog(ATHLETE);
    await $("#add-btn").click();
    await $("#entry-name").setValue(`E2E wall angle ${Date.now()}`);
    await choosePlace(owner);

    await $("#entry-submit-btn").click();
    await expect($("#entry-msg")).toHaveTextContent(contains("Choose the wall angle on the Performance page."));
    await expect($("#entry-overlay")).toBeDisplayed();

    await $("#entry-nav-forward").click();
    await expect($("#hardest-beta-help-link")).toHaveAttribute(
      "href",
      expect.stringMatching(/\/help\/describing-your-beta\/$/),
    );
    await $("#entry-hardest-beta").setValue("Steep. Heel hook the lip");
    await $("#entry-wall-angle").selectByAttribute("value", "slab");
    await expect($("#hardest-beta-angle-mismatch")).toHaveTextContent(
      "Your beta says “Steep” (overhang), but the wall angle is Slab. Check which is right.",
    );
    await expect($("#entry-wall-angle")).toHaveValue("slab");
    await $("#entry-nav-back").click();

    await chooseStatus("checkout");
    await expect($("#hardest-move-field")).not.toBeDisplayed();
    const posted = fetches.next("/-/api/entries", "POST");
    await $("#entry-submit-btn").click();
    const post = await posted;
    expect(post.status).toBe(201);
    expect(JSON.parse(post.body)).toMatchObject({ status: "checkout", wallAngle: null, hardestBeta: null });
  });

  it("editing an entry shows its hardest move and its pain moves", async () => {
    const owner = await claimOwner();
    await owner.grantPainInjuryConsent();
    await owner.settings({ athleteMode: true, activeDiscipline: "boulder" });
    await owner.seed({
      ...SEED,
      entries: [
        ...SEED.entries,
        {
          id: "e3",
          placeId: "p1",
          type: "boulder",
          status: "send",
          grade: "6A",
          date: "2026-05-04",
          name: "Move Seed",
          wallAngle: "slab",
          hardestBeta: "Rock over onto the right foot and lock off to the crimp",
          painMoves: [
            { limb: "foot", side: "right", holdType: "toe-hook", movementStyle: "dynamic", wallAngle: "overhang" },
          ],
        },
      ],
    });
    await gotoSyncedLog(owner);

    await $("#collapse-all-btn").click();
    await editRow("Move Seed").click();
    await expect($("#entry-overlay")).toBeDisplayed();
    await $("#entry-nav-forward").click();

    await expect($("#entry-wall-angle")).toHaveValue("slab");
    await expect($("#entry-hardest-beta")).toHaveValue("Rock over onto the right foot and lock off to the crimp");
    await expect($("#hardest-beta-readback")).toHaveTextContent(
      "Rock over onto the right foot and lock off to the crimp",
    );
    await expect($$("#pain-moves-list [data-move-row]")).toBeElementsArrayOfSize(1);
  });

  // inert, not visibility: the inactive page is clipped by a transformed ancestor.
  it("the Performance data page is only reachable in Athlete Mode", async () => {
    await gotoLog({ ...SEED, settings: { athleteMode: false, activeDiscipline: "boulder" } });
    await $("#add-btn").click();
    await expect($("#entry-overlay")).toBeDisplayed();

    await expect($("#entry-nav-forward")).not.toBeDisplayed();
    await expectInert("entry-page-2", true);
  });

  it("Performance -> and <- Log entry slide between the form's two pages", async () => {
    await gotoLog(ATHLETE);
    await $("#add-btn").click();

    await expectInert("entry-page-1", false);
    await expectInert("entry-page-2", true);

    await $("#entry-nav-forward").click();
    await expectInert("entry-page-2", false);
    await expectInert("entry-page-1", true);

    await $("#entry-nav-back").click();
    await expectInert("entry-page-1", false);
    await expectInert("entry-page-2", true);
  });

  it("page 2 grows with the moves added to it, so its end stays reachable on a phone (#1482)", async () => {
    const owner = await claimOwner();
    await owner.grantPainInjuryConsent();
    await owner.settings({ athleteMode: true, activeDiscipline: "boulder" });
    await owner.seed(SEED);
    await browser.setViewport({ width: 312, height: 700 });
    await gotoSyncedLog(owner);
    await $("#add-btn").click();
    await $("#entry-nav-forward").click();
    await expectInert("entry-page-2", false);

    for (let i = 0; i < 4; i++) await $("#pain-moves-add").click();

    await browser.waitUntil(() =>
      browser.execute(
        () =>
          Math.abs(
            document.getElementById("entry-pages-viewport").getBoundingClientRect().height -
              document.getElementById("entry-page-2").scrollHeight,
          ) <= 1,
      ),
    );
    const save = $("#entry-submit-btn-2");
    await save.scrollIntoView({ block: "nearest" });
    await expect(save).toBeDisplayedInViewport();
  });

  it("reopening the form after navigating to page 2 starts back on page 1", async () => {
    await gotoLog(ATHLETE);
    await $("#add-btn").click();
    await $("#entry-nav-forward").click();
    await expectInert("entry-page-2", false);
    await $("#entry-close").click();

    await $("#add-btn").click();
    await expectInert("entry-page-1", false);
    await expectInert("entry-page-2", true);
  });

  it("Boulder defaults to the Font scale (button + popover), and the picker lists Boulder's 3 scales", async () => {
    await gotoLog();
    await $("#add-btn").click();
    await expect($("#entry-overlay")).toBeDisplayed();

    await expect($("#grade-value-btn")).toBeDisplayed();
    await expect($("#grade-ns-fields")).not.toBeDisplayed();
    await expect($("#grade-value-btn")).toHaveTextContent("3");
    await $("#grade-value-btn").click();
    await expect($('#grade-value-listbox [role="option"][data-key="6A"]')).toHaveTextContent("6A");
    await $("#grade-value-btn").click();
    await expect($("#grade-value-listbox")).not.toBeDisplayed();

    await $("#grade-scale-btn").click();
    await expectEventually(
      () => textContents('#grade-scale-listbox [role="option"]'),
      ["Font", "Font (Non-standard)", "V-scale (Hueco)"],
    );
  });

  it("choosing Font (Non-standard) switches to the number/letter/modifier fields, and submits the built label + scale", async () => {
    const fetches = await recordFetches();
    const owner = await gotoLog();

    await $("#add-btn").click();
    await $("#entry-name").setValue("Non-standard test");
    await choosePlace(owner);

    await $("#grade-scale-btn").click();
    await option("#grade-scale-listbox", "Font (Non-standard)").click();
    await expect($("#grade-value-wrap")).not.toBeDisplayed();
    await expect($("#grade-ns-fields")).toBeDisplayed();
    await expect($("#grade-ns-letter-btn")).toHaveTextContent("n/a");
    await expect($("#grade-ns-modifier-btn")).toHaveTextContent("n/a");
    await $("#grade-ns-letter-btn").click();
    await expect($('#grade-ns-letter-listbox [role="option"][data-key=""]')).toHaveTextContent("n/a");
    await $("#grade-ns-letter-btn").click();

    // data-key, not text: "a" also matches "n/a".
    await $("#grade-ns-number-btn").click();
    await $('#grade-ns-number-listbox [role="option"][data-key="6"]').click();
    await $("#grade-ns-letter-btn").click();
    await $('#grade-ns-letter-listbox [role="option"][data-key="a"]').click();
    await $("#grade-ns-modifier-btn").click();
    await $('#grade-ns-modifier-listbox [role="option"][data-key="+"]').click();

    const posted = fetches.next("/-/api/entries", "POST");
    await $("#entry-submit-btn").click();
    const post = await posted;

    expect(post.status).toBe(201);
    const submittedBody = JSON.parse(post.body);
    expect(submittedBody.grade).toBe("6a+");
    expect(submittedBody.gradeScale).toBe("font-non-standard");
  });

  it("switching scale preserves the equivalent grade via the shared canonical ordinal", async () => {
    await gotoLog();
    await $("#add-btn").click();
    await $("#grade-value-btn").click();
    // data-key, not text: "6A" also matches "6A+".
    await $('#grade-value-listbox [role="option"][data-key="6A"]').click();

    await $("#grade-scale-btn").click();
    await option("#grade-scale-listbox", "V-scale").click();
    await expect($("#grade-value-btn")).toHaveTextContent("V3");
  });

  it("the entry-form grade scale preference persists to localStorage", async () => {
    await gotoLog();
    await $("#add-btn").click();
    await $("#grade-scale-btn").click();
    await option("#grade-scale-listbox", "V-scale").click();

    expect(await browser.execute(() => localStorage.getItem("logbook_grade_scale_entry_boulder"))).toBe("v-scale");

    await browser.refresh();
    await $("#add-btn").click();
    await $("#grade-scale-btn").click();
    await expect($('#grade-scale-listbox [role="option"][aria-selected="true"]')).toHaveTextContent("V-scale (Hueco)");
  });

  it("editing an entry shows its own actual gradeScale, not the current entry-form preference", async () => {
    await gotoLog({
      ...SEED,
      entries: [
        ...SEED.entries,
        {
          id: "e4",
          placeId: "p1",
          type: "boulder",
          status: "send",
          grade: "6a+",
          gradeScale: "font-non-standard",
          date: "2026-05-05",
          name: "Non-standard Seed",
        },
      ],
    });

    await $("#add-btn").click();
    await $("#grade-scale-btn").click();
    await option("#grade-scale-listbox", "V-scale").click();
    await $("#entry-close").click();

    await $("#collapse-all-btn").click();
    await editRow("Non-standard Seed").click();
    await expect($("#entry-overlay")).toBeDisplayed();

    await expect($("#grade-ns-fields")).toBeDisplayed();
    await expect($("#grade-value-wrap")).not.toBeDisplayed();
    await expect($("#grade-ns-number-btn")).toHaveTextContent("6");
    await expect($("#grade-ns-letter-btn")).toHaveTextContent("a");
    await expect($("#grade-ns-modifier-btn")).toHaveTextContent("+");
  });

  it("add-place modal: brand-new location leaves the country field open", async () => {
    const fetches = await recordFetches();
    await gotoLog();
    await $("#add-btn").click();
    await $("#place-btn").click();
    await $("#place-add-new-btn").click();
    await expect($("#add-place-overlay")).toBeDisplayed();

    const locationName = `E2E New Crag ${Date.now()}`;
    await $("#add-place-location").setValue(locationName);
    await expect($("#add-place-country-btn")).toBeEnabled();
    await expect($("#add-place-country-hint")).not.toBeDisplayed();

    await $("#add-place-area").setValue("Test Sector");
    await $("#add-place-country-btn").click();
    await $("#add-place-country-search").setValue("Norway");
    await $('#add-place-country-listbox li[data-key="Norway"]').click();

    const created = fetches.next("/-/api/locations", "POST");
    await $("#add-place-submit-btn").click();
    await created;
    await expect($("#add-place-overlay")).not.toBeDisplayed();
    await expect($("#place-btn")).toHaveTextContent(contains(locationName));
  });

  it("add-place modal: an existing location name locks the country field", async () => {
    const fetches = await recordFetches();
    await gotoLog({
      ...SEED,
      locations: [...SEED.locations, { id: "l2", name: "Fontainebleau", country: "France" }],
    });
    await $("#add-btn").click();
    await $("#place-btn").click();
    await $("#place-add-new-btn").click();

    await $("#add-place-location").setValue("fontainebleau");
    await expect($("#add-place-country-btn")).toBeDisabled();
    await expect($("#add-place-country-hint")).toBeDisplayed();
    await expect($("#add-place-country-btn")).toHaveTextContent(contains("France"));

    const areaName = `E2E Sector ${Date.now()}`;
    await $("#add-place-area").setValue(areaName);
    const created = fetches.next("/-/api/places", "POST");
    await $("#add-place-submit-btn").click();
    await created;
    await expect($("#add-place-overlay")).not.toBeDisplayed();
    await expect($("#place-btn")).toHaveTextContent(contains(areaName));
  });

  it("edits an existing entry via the table's Edit button", async () => {
    const fetches = await recordFetches();
    await gotoLog();

    await $("#collapse-all-btn").click();
    await editRow("Boulder Seed").click();
    await expect($("#entry-overlay")).toBeDisplayed();

    const editedName = `Edited Boulder ${Date.now()}`;
    await $("#entry-name").setValue(editedName);
    const saved = fetches.next("/-/api/entries", "PUT");
    await $("#entry-submit-btn").click();
    await saved;
    await expect($("#entry-overlay")).not.toBeDisplayed();
    await expect($("#sections")).toHaveTextContent(contains(editedName));
    await expect($("#sections")).not.toHaveTextContent(contains("Boulder Seed"));
  });

  for (const picker of [
    { name: "place picker", button: "#place-btn", popover: "#place-popover", search: "#place-search" },
    {
      name: "add-place country picker",
      button: "#add-place-country-btn",
      popover: "#add-place-country-popover",
      search: "#add-place-country-search",
    },
  ]) {
    it(`${picker.name}: ArrowDown/ArrowUp/Enter navigate and commit a real row`, async () => {
      if (picker.name === "place picker") {
        await gotoLog({ ...SEED, places: [...SEED.places, { id: "p2", locationId: "l1", area: "Sector 2" }] });
        await $("#add-btn").click();
        await expect($("#entry-overlay")).toBeDisplayed();
      } else {
        await gotoLog();
        await $("#add-btn").click();
        await $("#place-btn").click();
        await $("#place-add-new-btn").click();
        await expect($("#add-place-overlay")).toBeDisplayed();
        await $("#add-place-location").setValue(`E2E kbd-nav ${Date.now()}`);
        await expect($("#add-place-country-btn")).toBeEnabled();
      }

      await $(picker.button).click();
      await expect($(picker.popover)).toBeDisplayed();

      const listbox = picker.popover.replace("popover", "listbox");
      const options = () => $$(`${listbox} li[role=option]`);
      await expect(options()[0]).toBeDisplayed();
      const firstId = await options()[0].getAttribute("id");
      const secondId = await options()[1].getAttribute("id");
      const firstText = await options()[0].$("span.truncate").getProperty("textContent");

      await expect($(picker.search)).toHaveAttribute("aria-activedescendant", firstId);
      await expect(options()[0]).toHaveElementClass(ACTIVE_CLASS);

      await browser.keys("ArrowDown");
      await expect($(picker.search)).toHaveAttribute("aria-activedescendant", secondId);
      await expect(options()[1]).toHaveElementClass(ACTIVE_CLASS);
      await expect(options()[0]).not.toHaveElementClass(ACTIVE_CLASS);

      await browser.keys("ArrowUp");
      await expect($(picker.search)).toHaveAttribute("aria-activedescendant", firstId);

      await browser.keys("Enter");
      await expect($(picker.popover)).not.toBeDisplayed();
      if (picker.name === "place picker") {
        await expect($("#place-btn-label")).toHaveTextContent(firstText.trim());
        // Its name is "Place" then the place, from these two; browsers differ on the heading's CSS uppercase.
        await expect($("#place-btn")).toHaveAttribute("aria-labelledby", "place-heading place-btn-label");
        await expect($("#place-heading")).toHaveTextContent("Place");
      } else {
        await expect($("#add-place-country-label")).toHaveTextContent(firstText.trim());
      }
    });
  }

  it("notes overlay shows the entry's real notes text, closes via Escape or its own close button", async () => {
    await gotoLog({ ...SEED, entries: [{ ...SEED.entries[0], notes: "A real note to display" }] });

    await $("#collapse-all-btn").click();
    await $$(".notes-btn")[0].click();
    await expect($("#notes-overlay")).toBeDisplayed();
    await expect($("#notes-modal-text")).toHaveTextContent("A real note to display");

    await browser.keys("Escape");
    await expect($("#notes-overlay")).not.toBeDisplayed();

    await $$(".notes-btn")[0].click();
    await expect($("#notes-overlay")).toBeDisplayed();
    await $("#notes-close").click();
    await expect($("#notes-overlay")).not.toBeDisplayed();
  });
});
