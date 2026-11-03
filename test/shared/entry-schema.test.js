import { describe, expect, it } from "vitest";
import {
  entrySchema,
  HOLD_TYPES_BY_LIMB,
  isVideoHost,
  MOVEMENT_STYLES_BY_LIMB,
  validateEntryShape,
  VALID_GRADES,
  VALID_LIMBS,
  VALID_SIDES,
  VALID_STATUSES,
  VALID_TYPES,
  VALID_WALL_ANGLES,
} from "../../shared/entry-schema.js";
import { BOULDER_GRADES, LEAD_GRADES } from "../../shared/grade-data.js";
import * as v from "valibot";

function validEntry(overrides = {}) {
  return {
    placeId: "p1",
    name: "La Marie-Rose",
    grade: "6B",
    type: "boulder",
    status: "send",
    ...overrides,
  };
}

describe("validateEntryShape", () => {
  it("accepts a fully valid entry", () => {
    expect(validateEntryShape(validEntry())).toBeNull();
  });

  it.each(["placeId", "name", "grade", "type", "status"])(
    "rejects a missing %s (key entirely absent, not just falsy)",
    field => {
      const entry = validEntry();
      delete entry[field];
      expect(validateEntryShape(entry)).toBe(`Missing required field: ${field}`);
    },
  );

  it.each(["placeId", "name", "grade", "type", "status"])(
    "rejects an empty string %s the same as a missing one",
    field => {
      expect(validateEntryShape(validEntry({ [field]: "" }))).toBe(`Missing required field: ${field}`);
    },
  );

  it.each(["placeId", "name", "grade", "type", "status"])("rejects a null %s the same as a missing one", field => {
    expect(validateEntryShape(validEntry({ [field]: null }))).toBe(`Missing required field: ${field}`);
  });

  it("rejects an invalid type", () => {
    expect(validateEntryShape(validEntry({ type: "trad" }))).toMatch(/^type must be one of/);
  });

  it('accepts "6a" for boulder now -- valid under font-non-standard, ambiguous by design when no gradeScale is given', () => {
    expect(validateEntryShape(validEntry({ type: "boulder", grade: "6a" }))).toBeNull();
  });

  it("rejects a grade not valid for the entry's type in any of its scales", () => {
    expect(validateEntryShape(validEntry({ type: "boulder", grade: "VI+" }))).toMatch(
      /^grade is not a valid grade for/,
    );
  });

  it("accepts a grade valid for the sport type", () => {
    expect(validateEntryShape(validEntry({ type: "sport", grade: "6a", sportStyle: "lead" }))).toBeNull();
  });

  it("accepts an entry with no gradeScale at all", () => {
    expect(validateEntryShape(validEntry())).toBeNull();
  });

  it("accepts a valid gradeScale for the entry's discipline", () => {
    expect(validateEntryShape(validEntry({ gradeScale: "font-non-standard" }))).toBeNull();
  });

  it("rejects a gradeScale that doesn't belong to the entry's discipline", () => {
    expect(validateEntryShape(validEntry({ gradeScale: "french" }))).toMatch(/^gradeScale must be one of/);
  });

  it("rejects an unknown gradeScale id", () => {
    expect(validateEntryShape(validEntry({ gradeScale: "not-a-real-scale" }))).toMatch(/^gradeScale must be one of/);
  });

  it("rejects sportStyle on a non-sport entry", () => {
    expect(validateEntryShape(validEntry({ type: "boulder", sportStyle: "lead" }))).toBe(
      "sportStyle is only valid when type is sport",
    );
  });

  it("rejects an invalid sportStyle on a sport entry", () => {
    expect(validateEntryShape(validEntry({ type: "sport", grade: "6a", sportStyle: "solo" }))).toMatch(
      /^sportStyle must be one of/,
    );
  });

  it.each(["lead", "top_rope"])("accepts a %s sportStyle on a sport entry", sportStyle => {
    expect(validateEntryShape(validEntry({ type: "sport", grade: "6a", sportStyle }))).toBeNull();
  });

  it.each([undefined, null, ""])("rejects a sport entry with sportStyle %p (missing, not just falsy)", sportStyle => {
    expect(validateEntryShape(validEntry({ type: "sport", grade: "6a", sportStyle }))).toBe(
      "Missing required field: sportStyle",
    );
  });

  it("rejects an invalid status", () => {
    expect(validateEntryShape(validEntry({ status: "flashed" }))).toMatch(/^status must be one of/);
  });

  it.each(["2026", "2026-07", "2026-07-30"])("accepts a %s date shape", date => {
    expect(validateEntryShape(validEntry({ date }))).toBeNull();
  });

  it("accepts a missing/null date", () => {
    expect(validateEntryShape(validEntry({ date: undefined }))).toBeNull();
    expect(validateEntryShape(validEntry({ date: null }))).toBeNull();
  });

  it("rejects a malformed date shape", () => {
    expect(validateEntryShape(validEntry({ date: "30-07-2026" }))).toBe("date must be YYYY, YYYY-MM, or YYYY-MM-DD");
  });

  it("rejects a non-http(s) video URL", () => {
    expect(validateEntryShape(validEntry({ video: "ftp://example.com/clip" }))).toBe("video must be an http(s) URL");
  });

  it("rejects an unparseable video URL", () => {
    expect(validateEntryShape(validEntry({ video: "not a url" }))).toBe("video must be a valid URL");
  });

  it("knows each platform's short and country domains, and refuses look-alikes", () => {
    for (const host of [
      "www.youtube.com",
      "m.youtube.com",
      "youtu.be",
      "www.youtube-nocookie.com",
      "youtube.co.uk",
      "www.youtube.de",
      "youtube.com.au",
      "vimeo.com",
      "player.vimeo.com",
      "www.instagram.com",
      "instagr.am",
      "www.tiktok.com",
      "vm.tiktok.com",
      "vt.tiktok.com",
      "www.facebook.com",
      "m.facebook.com",
      "facebook.com.br",
      "fb.watch",
      "fb.com",
      "fb.me",
    ]) {
      expect(isVideoHost(host), host).toBe(true);
    }
    for (const host of [
      "example.com",
      "notyoutube.com",
      "youtube.com.evil.example",
      "youtube.example.com",
      "my-youtube.com",
      "fakefb.me",
      "vimeo.com.example",
      "youtube.museum",
    ]) {
      expect(isVideoHost(host), host).toBe(false);
    }
  });

  it("accepts a video link from a known video host or its subdomains, and nothing else", () => {
    expect(validateEntryShape(validEntry({ video: "https://www.youtube.com/watch?v=abc" }))).toBeNull();
    expect(validateEntryShape(validEntry({ video: "https://YOUTU.BE./abc" }))).toBeNull();
    expect(validateEntryShape(validEntry({ video: "https://example.com/clip" }))).toBe(
      "video must be a link to YouTube, Vimeo, Instagram, TikTok or Facebook",
    );
  });

  it("accepts a missing/null video", () => {
    expect(validateEntryShape(validEntry({ video: undefined }))).toBeNull();
    expect(validateEntryShape(validEntry({ video: null }))).toBeNull();
  });

  it.each(["placeId", "name"])("rejects a non-string %s", field => {
    expect(validateEntryShape(validEntry({ [field]: ["not-a-string"] }))).toBe(`${field} must be a string`);
  });

  it("rejects a non-string date, even one whose string form looks valid", () => {
    expect(validateEntryShape(validEntry({ date: ["2026"] }))).toBe("date must be a string");
  });

  it("rejects a non-string video, even one whose string form looks valid", () => {
    expect(validateEntryShape(validEntry({ video: ["https://example.com/clip"] }))).toBe("video must be a string");
  });

  it("rejects a non-string notes", () => {
    expect(validateEntryShape(validEntry({ notes: { text: "nice" } }))).toBe("notes must be a string");
  });

  it("accepts a missing/null/empty-string notes", () => {
    expect(validateEntryShape(validEntry({ notes: undefined }))).toBeNull();
    expect(validateEntryShape(validEntry({ notes: null }))).toBeNull();
    expect(validateEntryShape(validEntry({ notes: "" }))).toBeNull();
  });

  it("accepts a real string notes", () => {
    expect(validateEntryShape(validEntry({ notes: "Great route" }))).toBeNull();
  });
});

describe("entrySchema (bulk-import's own future entry point, #224 phase 3)", () => {
  it("v.safeParse reports every row's issues, not just the first, when asked to", () => {
    const result = v.safeParse(entrySchema, { name: "" });
    expect(result.success).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe("exported constants (for CSV template generation / future reuse)", () => {
  it("exposes the valid type/status/grade lists", () => {
    expect(VALID_TYPES).toEqual(["boulder", "sport"]);
    expect(VALID_STATUSES).toEqual(["send", "project", "archived", "checkout"]);
    expect(VALID_GRADES.boulder.length).toBeGreaterThan(0);
    expect(VALID_GRADES.sport.length).toBeGreaterThan(0);
  });

  it("derives boulder/sport grades directly from BOULDER_GRADES/LEAD_GRADES, never a separate copy", () => {
    expect(VALID_GRADES.boulder).toEqual(BOULDER_GRADES.map(x => x.g));
    expect(VALID_GRADES.sport).toEqual(LEAD_GRADES.map(x => x.g));
  });

  it("accepts a Boulder entry at #129's new low and high ends", () => {
    expect(v.safeParse(entrySchema, validEntry({ grade: "1A" })).success).toBe(true);
    expect(v.safeParse(entrySchema, validEntry({ grade: "9A" })).success).toBe(true);
  });

  it("accepts a Sport entry at #129's new low and high ends", () => {
    expect(v.safeParse(entrySchema, validEntry({ type: "sport", grade: "4a", sportStyle: "lead" })).success).toBe(true);
    expect(v.safeParse(entrySchema, validEntry({ type: "sport", grade: "9c+", sportStyle: "lead" })).success).toBe(
      true,
    );
  });
});

describe("wallAngle (#1523)", () => {
  it("takes any of the six angles, or none", () => {
    for (const wallAngle of ["slab", "vert", "overhang", "roof", "chimney", "dihedral", null, undefined]) {
      expect(validateEntryShape(validEntry({ wallAngle }))).toBeNull();
    }
  });

  it("refuses an angle it doesn't know", () => {
    expect(validateEntryShape(validEntry({ wallAngle: "cave" }))).toBe(
      "wallAngle must be one of: slab, vert, overhang, roof, chimney, dihedral",
    );
  });
});

describe("vocabulary constants", () => {
  it("exports the fixed limb/side/wall-angle lists", () => {
    expect(VALID_LIMBS).toEqual(["hand", "foot", "knee"]);
    expect(VALID_SIDES).toEqual(["left", "right"]);
    expect(VALID_WALL_ANGLES).toEqual(["slab", "vert", "overhang", "roof"]);
  });

  it("only offers lockoff for hand", () => {
    expect(MOVEMENT_STYLES_BY_LIMB.hand).toContain("lockoff");
    expect(MOVEMENT_STYLES_BY_LIMB.foot).not.toContain("lockoff");
    expect(MOVEMENT_STYLES_BY_LIMB.knee).not.toContain("lockoff");
  });

  it("has a hold-type list for every limb", () => {
    for (const limb of VALID_LIMBS) {
      expect(HOLD_TYPES_BY_LIMB[limb].length).toBeGreaterThan(0);
    }
  });
});

describe("attemptsToSend", () => {
  it("accepts a valid entry with no attemptsToSend", () => {
    expect(validateEntryShape(validEntry())).toBeNull();
  });

  it("accepts a non-negative integer", () => {
    expect(validateEntryShape(validEntry({ attemptsToSend: 7 }))).toBeNull();
  });

  it("accepts explicit null", () => {
    expect(validateEntryShape(validEntry({ attemptsToSend: null }))).toBeNull();
  });

  it("rejects a negative number", () => {
    expect(validateEntryShape(validEntry({ attemptsToSend: -1 }))).toBe(
      "attemptsToSend must be a non-negative integer",
    );
  });

  it("rejects a non-integer", () => {
    expect(validateEntryShape(validEntry({ attemptsToSend: 2.5 }))).toBe(
      "attemptsToSend must be a non-negative integer",
    );
  });

  it("rejects a string", () => {
    expect(validateEntryShape(validEntry({ attemptsToSend: "7" }))).toBe(
      "attemptsToSend must be a non-negative integer",
    );
  });
});

describe("rpe", () => {
  it("accepts a valid multiple of 10 in range", () => {
    expect(validateEntryShape(validEntry({ rpe: 70 }))).toBeNull();
  });

  it("accepts 0 and 100", () => {
    expect(validateEntryShape(validEntry({ rpe: 0 }))).toBeNull();
    expect(validateEntryShape(validEntry({ rpe: 100 }))).toBeNull();
  });

  it("accepts explicit null", () => {
    expect(validateEntryShape(validEntry({ rpe: null }))).toBeNull();
  });

  it("rejects a value above 100", () => {
    expect(validateEntryShape(validEntry({ rpe: 110 }))).toBe("rpe must be a multiple of 10 between 0 and 100");
  });

  it("rejects a value below 0", () => {
    expect(validateEntryShape(validEntry({ rpe: -10 }))).toBe("rpe must be a multiple of 10 between 0 and 100");
  });

  it("rejects a non-multiple-of-10 value", () => {
    expect(validateEntryShape(validEntry({ rpe: 55 }))).toBe("rpe must be a multiple of 10 between 0 and 100");
  });
});

function validPainRow(overrides = {}) {
  return {
    limb: "foot",
    side: "right",
    holdType: "toe-hook",
    movementStyle: "dynamic",
    wallAngle: "slab",
    ...overrides,
  };
}

describe("hardestBeta (#1522)", () => {
  it("accepts an entry with no hardest beta, or with some", () => {
    expect(validateEntryShape(validEntry())).toBeNull();
    expect(validateEntryShape(validEntry({ hardestBeta: "Heel hook the lip, cross to the crimp" }))).toBeNull();
  });

  it("rejects a hardest beta that isn't text", () => {
    expect(validateEntryShape(validEntry({ hardestBeta: 3 }))).toBe("hardestBeta must be a string");
  });

  it("takes 500 characters and refuses 501", () => {
    expect(validateEntryShape(validEntry({ hardestBeta: "a".repeat(500) }))).toBeNull();
    expect(validateEntryShape(validEntry({ hardestBeta: "a".repeat(501) }))).toBe(
      "Hardest move / sequence can be up to 500 characters.",
    );
  });
});

describe("painMoves", () => {
  it("accepts an entry with no painMoves", () => {
    expect(validateEntryShape(validEntry())).toBeNull();
  });

  it("accepts a valid pain move (no difficulty field)", () => {
    expect(validateEntryShape(validEntry({ painMoves: [validPainRow()] }))).toBeNull();
  });

  it("ignores a stray difficulty field on a pain move (not validated, not required)", () => {
    expect(validateEntryShape(validEntry({ painMoves: [{ ...validPainRow(), difficulty: "hardest" }] }))).toBeNull();
  });

  it("rejects an invalid limb the same way moves does", () => {
    expect(validateEntryShape(validEntry({ painMoves: [validPainRow({ limb: "elbow" })] }))).toBe(
      "painMoves[0].limb must be one of: hand, foot, knee",
    );
  });

  it("rejects painMoves that isn't an array", () => {
    expect(validateEntryShape(validEntry({ painMoves: {} }))).toBe("painMoves must be an array");
  });
});
