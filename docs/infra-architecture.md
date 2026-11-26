# Infrastructure architecture

How the Cloudflare side is provisioned and deployed today. Reasons are in
the linked ADRs; history is in commits and PRs. `infra/README.md` has the
step-by-step setup and the deliberate-delete procedure.

## The Worker and its environments

One Worker script, `climbing-logbook`
([ADR-0007](adr/0007-single-cloudflare-worker-not-separate-pages-project.md)),
configured in `wrangler.jsonc`. It routes by hostname inside
`server/index.js` (see `docs/app-architecture.md`'s "Request routing").

| Environment | Routes | D1 database | How it's deployed |
|---|---|---|---|
| production (`env.production`) | `climbinglogbook.com/*`, `my.climbinglogbook.com/*` | `climbing-logbook` | `deploy.yml` or `promote.yml` |
| beta (`env.beta`) | `beta.climbinglogbook.com/*` | `climbing-logbook` (shared with production, [ADR-0020](adr/0020-beta-environment-shared-data-tag-promotion.md)) | `deploy.yml` on every release tag |
| preview (`env.preview`) | none; a `*.workers.dev` preview URL per PR | `climbing-logbook-preview` | `preview.yml` | PR, unless it only touches `docs/`, `infra/`, `test/`, `e2e/` or root-level Markdown | Builds with `CLOUDFLARE_ENV=preview`, uploads a version under the alias `pr-<n>`, and comments the URL. A second job applies the PR's migrations to the shared preview database, one run at a time. It never seeds |
| `preview-db.yml` | Push to `main` that changes `migrations/` or the seed scripts and their data; or run by hand | Deploys the `main` Preview, drops every table in the preview database (children first, which D1 counts as no writes), migrates and seeds it |
| e2e (`env.e2e`) | none; local `vite preview` only | `climbing-logbook-preview`, local only | started by `wdio.conf.js` |

- **The environment is chosen at build time.** `CLOUDFLARE_ENV` selects it
  for `pnpm run deploy:build`, which refuses to run without a recognised
  value (`scripts/require-cloudflare-env.mjs`).
- **`d1_databases` is repeated in every environment on purpose.** A named
  environment that leaves it out silently inherits production's database;
  preview once did exactly that.
- **`workers_dev` is `false` at the top level** so there's no second,
  unlisted hostname for production. Preview turns it on for its preview
  URLs. If a fresh setup's preview URL 404s, check the Worker's "Preview
  URLs" setting in the dashboard: Cloudflare made them opt-in in September
  2025.

## What OpenTofu manages

This section is kept in the private vault.

## Workflows

This section is kept in the private vault.

## Secrets and variables

This section is kept in the private vault.

## Beta invites

This section is kept in the private vault.

## Disaster recovery

1. Run "Bootstrap OpenTofu state bucket".
2. Run "Infra" (merge to `infra/**`, or dispatch it). OpenTofu recreates
   the D1 database and the rest. Open and merge the sync PR its summary
   links to, which updates `wrangler.jsonc` and cuts a release.
3. Set the Worker secrets again: run "Sync Worker secrets", and `wrangler secret put` the rest, per environment.
4. Promote that release to production.

A deleted D1 database's data can't be restored from Cloudflare, which is
why it's `prevent_destroy` and why every deploy logs a Time Travel
bookmark first (`docs/versioning.md`).
