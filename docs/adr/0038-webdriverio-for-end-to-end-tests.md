# 38. WebdriverIO for end-to-end tests, in Chrome and Firefox

## Status

Accepted (#1556, 2026-11-03). Amends [ADR-0033](0033-parallel-e2e-with-seeded-users.md): its projects now run on WebdriverIO, and a third is added.

## Context

The e2e suite ran on Playwright, in Chromium only. Playwright is a Microsoft project, and Microsoft is on both BDS lists. [ADR-0005](0005-screen-dependencies-against-bds-boycott-lists.md) allows a listed company's free tool only when nothing comparable exists, and WebdriverIO is comparable. Chromium-only coverage also missed Firefox, which some of the people using the app browse with.

The #1594 spike ported a sample of specs and measured both browsers. The rest were ported story by story (#1595–#1599), running alongside Playwright until every spec passed.

## Decision

1. **WebdriverIO with Mocha, over WebDriver BiDi,** in Chrome and Firefox. CI runs each browser as its own job; the `e2e` check passes only when both do.
2. **Three projects** (`wdio.conf.js`, `e2e/shared-specs.js`):
   - **isolated:** in parallel, each test in its own BiDi user context (`parallelMode: "userContexts"`).
   - **shared:** one test at a time, as the seeded dev user. As in ADR-0033: specs that use the dev user, write D1 through wrangler, or measure timing.
   - **classic:** specs that need WebDriver Classic commands, which parallel mode refuses. Each test gets a fresh session. The passkey specs use it for the virtual authenticator.
3. **Standard tooling first.** Requests are mocked with `browser.mock`, and real responses are changed by fetching them first, then answering with the edited body. Only where no standard command exists does a helper drive BiDi directly (`e2e/wdio-*.js`), for example to hold a request open.
4. **Axe runs from `axe-core` directly.** `@axe-core/webdriverio` doesn't support WebdriverIO 10, so `e2e/wdio-axe.js` injects the library, as that package does.

## Consequences

- **Some tests run in Chrome only,** where Firefox exposes nothing to check against:
  - Which requests the service worker made, and what it served from its cache. Firefox's BiDi doesn't report the worker's requests, and its Resource Timing has no `deliveryType`.
  - Passkey autofill. Chrome's virtual authenticator answers a conditional request by itself. Firefox's waits for a pick from its own autofill list, which WebDriver can't reach.
- **Offline emulation doesn't reach the service worker** in either browser: the worker's own fetches stay online. Tests that need the worker's pre-cache to be complete check its cache directly, rather than loading pages offline.
- **The `/sw.js` switch-over test was dropped.** It served a stub worker script, and WebdriverIO can't stub one. It covered the one-off switch from `/sw.js` to `/service-worker.js` (#983, September 2026), which `client/register-sw.js` still handles.
- **The harness smooths over gaps between the tools.** `e2e/wdio-hooks.js` waits for elements to be actionable before clicking and rides out navigations that BiDi reports as errors. `e2e/wdio-browser.js` holds the shared waits. A failed test prints its last commands, leaving out cookies and mocked session responses.
- **An element, once found, keeps pointing at its node.** After a re-render it reads as empty rather than failing, so tests re-query, or poll with `expectEventually`.
- **Firefox has no per-test reduced-motion override over BiDi,** so its profile turns reduced motion on for every test.
