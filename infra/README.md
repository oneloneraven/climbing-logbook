# Infrastructure

OpenTofu-managed: the D1 database, DNS, and
zone-level TLS/DNS settings, Cache Rules, and WAF custom and managed rules. Everything here is declarative,
repeatable, and idempotent — re-running `tofu apply` with no
changes is always a no-op.

The only thing *not* managed here, by design: the logbook's actual data
(D1 rows).

## One-time setup (per Cloudflare account)

This section is kept in the private vault.

## Not in OpenTofu

This section is kept in the private vault.

## Local runs

```
cd infra
cp terraform.tfvars.example terraform.tfvars   # fill in real values, gitignored
export AWS_ACCESS_KEY_ID=<R2 access key>
export AWS_SECRET_ACCESS_KEY=<R2 secret key>
export CLOUDFLARE_API_TOKEN=<token>
tofu init
tofu plan
```

### OpenTofu version

`infra.yml` pins OpenTofu exactly in `tofu_version`. Dependabot doesn't bump
it. To upgrade, take the newest `opentofu/opentofu` release that is more than
72 hours old (not a pre-release), change `tofu_version`, and run the same
version locally.

## Deleting or replacing a resource (#1075)

This section is kept in the private vault.

## Disaster recovery

If the account/project is lost entirely:
1. Re-run "Bootstrap OpenTofu state bucket" (recreates the state bucket).
2. Merge/push to `infra/**` — OpenTofu recreates the D1 database, and
   `wrangler.jsonc` is updated automatically.
3. Manually trigger the "Deploy" workflow (its sync commit from step 2
   is tagged `[skip ci]` so Infra and Deploy don't trigger each other in a loop, so this
   one step isn't automatic).
