# 41. Named Access service tokens may read the admin usage figures, and nothing else

## Status

Accepted (#1728, 2026-11-26). Amends [ADR-0034](0034-admin-host-behind-cloudflare-access.md).

## Context

[ADR-0034](0034-admin-host-behind-cloudflare-access.md) lets only the owner into the admin host: Access allows one email, and the Worker checks the Access token's email against `OWNER_EMAIL` as well.

Two services need the usage figures (`GET /-/api/admin/usage`): Engage's Home, which shows how many people logged a climb in the last 30 days (oneloneraven/engage#109), and Grafana Cloud's Infinity data source (#1521). A service authenticates to Access with a service token, and the JWT Access issues for one carries the token's client id in `common_name` and no email, so today the Worker refuses it.

## Decision

1. **A service token gets in only if its client id is in `USAGE_SERVICE_TOKENS`** (comma-separated, a Worker secret). Unset or blank, no service token gets in.
2. **It may only `GET /-/api/admin/usage`.** Every other admin route, page and method answers 403 before any routing, so a later admin route is closed to it by default.
3. **A token carrying an email is a person's,** checked against `OWNER_EMAIL` as before, whatever else it carries.
4. **The tokens and the service-auth policy live in the identity stack, coraxia,** beside the Access application itself (#1707). Each service holds its own token's id and secret.

## Consequences

- **Adding a reader** is a token in coraxia, its client id appended to `USAGE_SERVICE_TOKENS`, and a run of "Sync Worker secrets".
- **Revoking one** is removing its client id and syncing, or revoking the token in coraxia; either closes it.
- **The usage figures are aggregates only,** with no user's data in them, so a leaked service token reveals counts, not people.
