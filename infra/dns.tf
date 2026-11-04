# Placeholder records so the hostnames resolve through Cloudflare, where the Worker Route answers: docs/infra-architecture.md.
data "cloudflare_zone" "app" {
  filter = {
    name = var.app_zone_name
  }
}

resource "cloudflare_dns_record" "app_apex" {
  zone_id = data.cloudflare_zone.app.id
  name    = var.app_zone_name
  type    = "A"
  content = "192.0.2.1"
  ttl     = 1
  proxied = true
  comment = "Placeholder for the climbing-logbook Worker Route (#295) -- traffic never actually reaches this IP."

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_dns_record" "app_my_subdomain" {
  zone_id = data.cloudflare_zone.app.id
  name    = "my.${var.app_zone_name}"
  type    = "A"
  content = "192.0.2.1"
  ttl     = 1
  proxied = true
  comment = "Placeholder for the climbing-logbook Worker Route (#295) -- traffic never actually reaches this IP."

  lifecycle {
    prevent_destroy = true
  }
}

# The same placeholder pattern; env.beta's Workers Route serves it (ADR-0020).
resource "cloudflare_dns_record" "app_beta_subdomain" {
  zone_id = data.cloudflare_zone.app.id
  name    = "beta.${var.app_zone_name}"
  type    = "A"
  content = "192.0.2.1"
  ttl     = 1
  proxied = true
  comment = "Placeholder for the beta Worker Route (#443) -- traffic never actually reaches this IP."

  lifecycle {
    prevent_destroy = true
  }
}

# Only the CAs Cloudflare issues this zone's certificates from. Cloudflare also adds these itself when any CAA record exists.
# No iodef: a published reporting address gets scraped.
locals {
  cloudflare_cas = ["letsencrypt.org", "pki.goog", "ssl.com", "sectigo.com"]
  caa_records = merge(
    { for ca in local.cloudflare_cas : "issue-${ca}" => { tag = "issue", value = ca } },
    { for ca in local.cloudflare_cas : "issuewild-${ca}" => { tag = "issuewild", value = ca } },
  )
}

resource "cloudflare_dns_record" "app_caa" {
  for_each = local.caa_records
  zone_id  = data.cloudflare_zone.app.id
  name     = var.app_zone_name
  type     = "CAA"
  ttl      = 3600
  data = {
    flags = 0
    tag   = each.value.tag
    value = each.value.value
  }
}
