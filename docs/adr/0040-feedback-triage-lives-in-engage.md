# 40. Feedback and issue reports are triaged in Engage, not on the admin host

## Status

Accepted (#1712, 2026-11-25). Supersedes the report and feedback triage part of [ADR-0034](0034-admin-host-behind-cloudflare-access.md); the rest of ADR-0034 stands.

## Context

[ADR-0034](0034-admin-host-behind-cloudflare-access.md) put report and feedback triage on the admin host first, ahead of user management and the usage dashboard. The app stored each submission in its own D1 tables (`issue_reports`, `feedback_submissions`) and posted a notice to a Discord channel.

Since #1709 the report and feedback forms send to Engage, the owner's feedback service, which keeps feedback, email, releases and health for every product (oneloneraven/engage#48). The app's own tables only ever held test data, so nothing was imported from them.

## Decision

1. **Engage owns feedback and issue reports:** storing them, triage, replies and retention. The app keeps no copy.
2. **The admin host keeps every action on the app's own data:** users, entries, invites and moderation. Engage links to it for anything that acts on Climbing Logbook data (oneloneraven/engage#126).
3. **Hiding and unhiding an entry moves to the Users tab,** on each climb of the logbook view, since the report page that held it is gone. It calls the same `entries/<id>/hide|unhide` API and is recorded in Activity.
4. **The admin host opens on Users.**

## Consequences

- **The app no longer takes submissions.** `/-/api/report-issue`, `/-/api/feedback`, the admin Reports and Feedback tabs, and the Discord support notice are gone.
- **The tables are dropped in a later release,** once the code that no longer reads them is in production ([versioning](../versioning.md#database-migrations-expand-and-contract)).
- **Acting on a report takes two places:** read it in Engage, then hide the entry or suspend the account on the admin host.
