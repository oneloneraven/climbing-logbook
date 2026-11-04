// Usage: docs/scripts.md.
import { mintInviteCode } from "../shared/invite-code.js";

const i = process.argv.indexOf("--email");
const email = i === -1 ? null : process.argv[i + 1]?.toLowerCase();
if (email !== null && !/^[^\s'@]+@[^\s'@]+\.[^\s'@]+$/.test(email ?? "")) {
  console.error("Usage: node scripts/mint-invite.mjs [--email <address>]");
  process.exit(1);
}
const code = mintInviteCode();
const values = email ? `('${code}', '${email}')` : `('${code}')`;
const columns = email ? "(code, email)" : "(code)";
console.log(`Code: ${code}`);
console.log(
  `Store it: pnpm exec wrangler d1 execute climbing-logbook --remote --command "INSERT INTO beta_invites ${columns} VALUES ${values}"`,
);
console.log(`Send: https://climbinglogbook.com/register/?code=${code}`);
