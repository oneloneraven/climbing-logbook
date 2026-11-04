# Scripts

The scripts people run by hand. Build steps and CI helpers are run by `package.json` and the workflows, and aren't listed here.

## Local development

| Command | What it does |
|---|---|
| `pnpm dev [--no-seed] [--no-open]` | Starts Vite and the Tailwind watcher, seeds data and opens the login page; Ctrl+C stops it all. It uses Vite, not `wrangler dev`, which rewrites the origin to the production route and ignores `my.` hosts. |
| `pnpm seed [baseUrl] [--large] [--scenario empty\|single-discipline]` | Seeds the local dev user's logbook. `--large` adds many places. |
| `pnpm seed:demo [--remote] [--env preview]` | Seeds the three demo accounts with raw SQL, as their names are reserved and can't sign up. Their tags cluster so the Strengths and Injury reports have a real signal. Fixed IDs, so it's safe to re-run. |
| `pnpm e2e:area <area...>` | Runs the e2e specs for those areas (`e2e/areas.js`). |

## Generated files

Run after changing what they read; the output is committed.

| Command | What it does |
|---|---|
| `node scripts/generate-brand-lockup.mjs` | Writes `static/-/brand-lockup.svg` from Bebas Neue outlines, so the lockup never depends on the web font, and the generated block in `climbing-header.js`. Run after changing the text, font or geometry. |
| `node scripts/generate-beta-icons.mjs` | Rasterises `static/-/beta/icon*.svg` to the committed PNGs. `CHROMIUM_PATH` overrides the browser. |
| `node scripts/generate-countries.mjs > /tmp/countries.js` | Prints the `COUNTRIES` array for `shared/countries.js`, to paste in. Pins sit on geographic centres. |
| `node scripts/generate-world-map.mjs` | Writes `static/-/world-map-{greenwich,americas,oceania}.json` ([Generated data](app-architecture.md#generated-data)). |

## The auth schema

`auth.config.mjs` exists only for `better-auth generate`, which writes the auth schema migration. The CLI isn't a dependency, as it pins an old, vulnerable Better Auth, so install it only while regenerating:

```bash
pnpm add -D @better-auth/cli better-sqlite3
pnpm exec better-auth generate --config auth.config.mjs --output migrations/<next>_<name>.sql -y
pnpm remove @better-auth/cli better-sqlite3
```

## Operations

| Command | What it does |
|---|---|
| `pnpm audit:usernames [--remote] [--env preview]` | Reports existing usernames the current policy would reject, skipping demo accounts; it never renames anyone. Run after a reserved or blocked list grows. Exits 1 on any failure. |
| `node scripts/mint-invite.mjs [--email <address>]` | Prints a new beta invite code, the command that stores it, and the link to send. |
| `node scripts/pull-beta-samples.mjs [file]` | Saves the beta samples outside any repo, replacing the last pull so they age out with the table. |
| `node scripts/synthetic-check.mjs` | Signs in on the apex and checks the session cookie reaches `my.`, matching `Domain` as a browser does. Read-only. Needs `SYNTHETIC_USER_EMAIL` and `SYNTHETIC_USER_PASSWORD` ([infra/README.md](../infra/README.md)); `APEX_URL` and `APP_URL` override the hosts. Locally the cookie is host-only, so the check rightly refuses it. |
| `node scripts/create-cloudflare-ci-tokens.mjs` | Creates the four scoped tokens CI uses and stores each straight in GitHub, never printing a value. It asks for a token that can create account tokens (Account API Tokens: Edit). Rerun to rotate: each older token with the same name is revoked once its replacement is stored. |
| `node scripts/bootstrap-state.mjs` | Creates the OpenTofu state bucket if it's missing. Needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. |
| `PREVIEW_DEV_EMAIL=… PREVIEW_DEV_PASSWORD=… PREVIEW_BETA_INVITE_CODE=… node scripts/seed-preview-data.mjs <preview-url>` | Rebuilds the shared preview database from `main`: drops every table, migrates and seeds. CI runs it; the account comes from repository secrets, as previews are public. |
