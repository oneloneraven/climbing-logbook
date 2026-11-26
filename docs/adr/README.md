# Architecture Decision Records

Records of significant architecture decisions made in this project, and the
reasoning behind them — so a future reader can see *why*, not just *what*,
without doing git archaeology through old PRs and issue threads.

## Format

Plain Markdown, [Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):
Title, Status, Context, Decision, Consequences. No tooling or dependency
(no `adr-tools`, no log4brains) — git-tracked files that render natively on
GitHub, the same treatment every other doc in this repo already gets.

## Rules

- **Numbered sequentially**, `NNNN-title.md`, never reused.
- **Never edited after acceptance** — if a decision changes, write a new
  ADR and have it supersede the old one by reference (link both ways).
  The old ADR's "Status" becomes "Superseded by ADR-000X"; its content
  stays as a historical record of what was believed true at the time. A
  pure transcription fix (removing content that duplicates a living doc
  elsewhere, with the underlying decision itself unchanged) is a narrow
  exception to this, not a loophole for touching up reasoning or
  conclusions after the fact — see ADR-0006's own edit for a real example
  (found and corrected during #359).
- **Don't duplicate an actively-maintained checklist inside a Decision
  section** (e.g. `docs/coding-standards.md`'s Part 2, an intentionally
  living document) — link to it instead. A copy frozen inside an ADR
  drifts silently out of sync the moment the real checklist changes,
  since the ADR itself can't be updated to match.
- **Write one when a decision is genuinely hard to reverse, or when the
  reasoning isn't obvious from reading the resulting code** — not for
  every change. Routine feature work doesn't need one.
- **Capture the decision when it's made, not when it ships** — implementation
  can lag behind the ADR (see ADR-0015, written before its own #363).

## Index

| ADR | Title | Status |
|---|---|---|
| 0001 | Record architecture decisions with ADRs | Accepted |
| 0002 | Replace Cloudflare Access with Better Auth | Accepted |
| 0003 | Native Web Components for shared UI + multi-page route split | Accepted |
| 0004 | Adopt Tailwind for styling, reject Radix, add Floating UI | Accepted |
| 0005 | Screen dependencies and vendors against BDS boycott lists | Accepted |
| 0006 | Design for poor connectivity as a first-class constraint | Accepted, scope refined by 0017 |
| 0007 | A single Cloudflare Worker, not a separate Pages project per surface | Accepted |
| 0008 | Tag-based semantic versioning, not package.json commits | Accepted |
| 0009 | Normalized D1 schema with real lookup tables | Accepted |
| 0010 | Public URL structure: my.&lt;domain&gt;/username | Accepted |
| 0011 | Three-layer test pyramid: real Workers runtime, extracted-logic unit tests, Playwright E2E | Superseded by 0030 |
| 0012 | Client-side modularization: esbuild + ES modules + factories, no framework | Accepted, bundler choice superseded by 0021 |
| 0013 | PR preview deployments via wrangler versions upload | Superseded by 0036 |
| 0014 | Closed-beta invite gate, togglable off rather than removed | Accepted, partially superseded by 0016 |
| 0015 | Cloudflare Web Analytics with EU exclusion, not a cookie consent banner | Accepted |
| 0016 | Beta invite claim/release runs as a request-level wrapper, not a Better Auth hook | Accepted |
| 0017 | Connectivity-first resilience is scoped to the owner's write-path, not every page | Accepted |
| 0018 | Server-side aggregation for derived views, no client-side fallback | Superseded by 0031 |
| 0019 | Local-first sync for /log: chunked initial load + delta sync, not click-driven pagination | Accepted |
| 0020 | Beta environment: shared production data, tag-cumulative promotion, opt-in gate | Accepted, access control superseded by 0029 |
| 0021 | Vite as the production build tool: client bundling, Worker build, and explicit environment selection | Accepted |
| 0022 | 11ty (Eleventy) for page-shell templating | Accepted |
| 0023 | Instant shell, decoupled content loading, and a shell-level sync/offline indicator | Accepted |
| 0024 | Sync/offline status timeout belongs on the fetch, not on how long the animation runs | Accepted |
| 0025 | Static asset caching: content hashes where the build provides them, versioned query strings where it doesn't | Accepted, build-wide `?v=` superseded by 0028 |
| 0026 | Local preview tooling can't validate real network performance — automated tests stop at cache correctness | Accepted |
| 0027 | Database-backed rate limiting, not Better Auth's in-memory default | Superseded by the Rate Limiting binding (#1292) |
| 0028 | The service worker owns the owner app's shell: offline cold launch, cache-first per build, never data | Accepted |
| 0029 | Beta channel: two-state enrollment, checked on the page, one channel per origin | Accepted |
| 0030 | Test against the real Worker, mock only what it can't produce, measure coverage | Accepted |
| 0031 | Owner reports and map counts are computed on the device, from the synced store | Accepted, supersedes 0018 |
| 0032 | The combined view lives on the owner pages, not the public profile | Accepted |
| 0033 | Run the e2e suite in parallel, with users seeded straight into D1 | Accepted, amended by 0038 |
| 0034 | Admin pages live on their own host, behind Cloudflare Access | Accepted, feedback triage superseded by 0040 |
| 0035 | Capacity and operational targets: design for 50,000 users | Accepted |
| 0036 | PR previews via Cloudflare Previews | Accepted |
| 0037 | Rate limiting through the Workers Rate Limiting binding | Accepted |
| 0038 | WebdriverIO for end-to-end tests, in Chrome and Firefox | Accepted, amends 0033 |
| 0039 | No Safari e2e until Safari supports WebDriver BiDi | Accepted |
| 0040 | Feedback and issue reports are triaged in Engage, not on the admin host | Accepted, supersedes part of 0034 |
| 0041 | Named Access service tokens may read the admin usage figures, and nothing else | Accepted, amends 0034 |

Every ADR is kept in the private vault, at `oneloneraven-vault/climbing-logbook/adr/`. This index lists their numbers and titles only.
