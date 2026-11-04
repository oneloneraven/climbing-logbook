// Only for better-auth generate, which writes the auth schema migration: docs/scripts.md.
import { betterAuth } from "better-auth";
import { twoFactor, username } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import Database from "better-sqlite3";

export const auth = betterAuth({
  database: new Database(":memory:"),
  basePath: "/-/api/auth",
  secret: "cli-schema-generation-only",
  emailAndPassword: { enabled: true },
  // Mirrors server/lib/auth.js.
  rateLimit: { enabled: true, storage: "database" },
  plugins: [username(), twoFactor(), passkey()],
});
