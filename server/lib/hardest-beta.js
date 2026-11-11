import { parse, toMovements } from "@ravendarque/beta-interpreter";
import pkg from "../../package.json" with { type: "json" };
import { nextCursorSql, replaceChildRowStatements } from "./d1-resource.js";

// The pinned package version, so a stored movement shows how far behind the current vocabulary it is.
export const VOCABULARY_VERSION = pkg.dependencies["@ravendarque/beta-interpreter"];

const REREAD_BATCH = 50;

const ids = terms => terms.map(t => t.id);

function compactHold(hold) {
  if (!hold) return null;
  return {
    role: hold.role,
    ori: hold.ori?.id ?? null,
    kinds: ids(hold.kinds),
    qualifiers: hold.qualifiers,
    plural: hold.plural,
  };
}

function compactContact(contact) {
  return {
    side: contact.side,
    hold: compactHold(contact.hold),
    holdSource: contact.holdSource,
    techniques: ids(contact.techniques),
  };
}

function compactState(state) {
  return {
    limbs: Object.fromEntries(Object.entries(state.limbs).map(([limb, contact]) => [limb, compactContact(contact)])),
    body: ids(state.body),
    unplaced: state.unplaced.map(u => ({ part: u.part, ...compactContact(u) })),
  };
}

export function betaSampleStatements(env, text) {
  const sample = text?.trim();
  if (env.APP_ENV !== "beta" || !sample) return [];
  return [
    env.LOGBOOK_DB.prepare(
      `INSERT INTO beta_samples (text, interpreter_version) VALUES (?, ?) ON CONFLICT(text) DO NOTHING`,
    ).bind(sample, VOCABULARY_VERSION),
  ];
}

export function hardestBetaMovements(text) {
  if (!text?.trim()) return [];
  const record = toMovements(parse(text));
  const terrain = JSON.stringify({ terrain: ids(record.terrain), features: ids(record.features) });
  return record.movements.map((movement, position) => ({
    position,
    crux: movement.crux,
    terrain,
    transition: movement.transition
      ? { terms: ids(movement.transition.terms), limbs: movement.transition.limbs, side: movement.transition.side }
      : null,
    start: compactState(movement.start),
    end: compactState(movement.end),
  }));
}

// One entry_movements row, shared by saves and the demo seed so both store the same shape.
export function movementRow(movement, id, entryId) {
  return {
    id,
    entry_id: entryId,
    position: movement.position,
    crux: movement.crux ? 1 : 0,
    terrain: movement.terrain,
    transition: movement.transition ? JSON.stringify(movement.transition) : null,
    start_state: JSON.stringify(movement.start),
    end_state: JSON.stringify(movement.end),
    vocabulary_version: VOCABULARY_VERSION,
  };
}

export async function rereadStaleMovements(env) {
  const { results } = await env.LOGBOOK_DB.prepare(
    `SELECT id, user_id, hardest_beta FROM entries WHERE deleted_at IS NULL
       AND id IN (SELECT entry_id FROM entry_movements WHERE vocabulary_version != ?) LIMIT ${REREAD_BATCH}`,
  )
    .bind(VOCABULARY_VERSION)
    .all();
  if (!results.length) return 0;
  const written = await env.LOGBOOK_DB.batch(
    results.flatMap(climb => {
      // Written only if the beta is still what was read, so a save in between keeps its own reading.
      const unedited = {
        sql: "EXISTS (SELECT 1 FROM entries WHERE id = ? AND hardest_beta IS ?)",
        binds: [climb.id, climb.hardest_beta],
      };
      return [
        ...replaceChildRowStatements(
          env,
          "entry_movements",
          climb.id,
          hardestBetaMovements(climb.hardest_beta),
          movementRow,
          unedited,
        ),
        env.LOGBOOK_DB.prepare(
          `UPDATE entries SET sync_cursor = ${nextCursorSql("entries")} WHERE id = ? AND hardest_beta IS ? RETURNING 1`,
        ).bind(climb.user_id, climb.id, climb.hardest_beta),
      ];
    }),
  );
  return written.reduce((count, result) => count + result.results.length, 0);
}
