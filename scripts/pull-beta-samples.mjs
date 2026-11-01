// Saves the beta samples outside any repo, replacing the last pull so they age out with the table: node scripts/pull-beta-samples.mjs [file]
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { d1Query } from "./lib/dev-session.mjs";

const out = process.argv[2] ?? join(homedir(), ".local/share/beta-interpreter/samples.json");
const samples = d1Query("SELECT text, interpreter_version, created_at FROM beta_samples ORDER BY created_at", {
  remote: true,
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(samples, null, 2), { mode: 0o600 });
console.log(`${samples.length} samples saved to ${out}`);
