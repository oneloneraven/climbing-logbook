# 39. No Safari e2e until Safari supports WebDriver BiDi

## Status

Accepted (#1616, 2026-11-04). Follows [ADR-0038](0038-webdriverio-for-end-to-end-tests.md).

## Context

[ADR-0038](0038-webdriverio-for-end-to-end-tests.md) runs the e2e suite in Chrome and Firefox over WebDriver BiDi. The harness relies on BiDi throughout: parallel tests each get their own user context, requests are mocked and held, and cookies are set per user context.

The #1616 spike ran every spec in Safari on a GitHub macOS runner (macOS 26.6.2 and its Safari), one session per test, without parallel mode. All 486 tests failed before starting, with WebdriverIO reporting that no BiDi session was established. That happened both with and without `webSocketUrl: true` in the capabilities. WebdriverIO's documentation lists BiDi support for Chrome, Edge and Firefox only. There's an unverified report that Safari 27 adds an optional BiDi WebSocket.

A Safari-only harness over WebDriver Classic would be a second harness to maintain, and would leave out the mocking and per-test isolation the suite depends on.

## Decision

1. **No Safari e2e check for now.** The suite runs in Chrome and Firefox only.
2. **Revisit when Safari supports BiDi** on GitHub's macOS runners (#1654): repeat the spike, then add an `e2e-safari` check for whatever specs Safari can run.

## Consequences

- WebKit-specific behaviour isn't covered by an automated check.
- The `safari` entry in `e2e/wdio-browsers.js` stays, asking for a BiDi session as Chrome and Firefox do, so the spike can be repeated with `E2E_BROWSERS=safari`.
