# Enabling adds the apex MX and SPF, and disabling deletes them, even edited ones. No name: the API takes one as a subdomain.
resource "cloudflare_email_routing_dns" "app" {
  zone_id = data.cloudflare_zone.app.id
}

resource "cloudflare_email_routing_settings" "app" {
  zone_id = data.cloudflare_zone.app.id
  # So the reply@ rule also matches Engage's signed reply+…@ addresses.
  support_subaddress = true

  depends_on = [cloudflare_email_routing_dns.app]
}

resource "cloudflare_email_routing_rule" "engage" {
  for_each = toset(["hello", "support", "reply"])
  zone_id  = data.cloudflare_zone.app.id
  name     = "${each.key}@ to Engage"
  enabled  = true
  matchers = [{ type = "literal", field = "to", value = "${each.key}@${var.app_zone_name}" }]
  actions  = [{ type = "worker", value = [var.engage_worker_name] }]

  depends_on = [cloudflare_email_routing_settings.app]
}

resource "cloudflare_email_routing_catch_all" "app" {
  zone_id  = data.cloudflare_zone.app.id
  name     = "Drop everything else"
  enabled  = true
  matchers = [{ type = "all" }]
  actions  = [{ type = "drop" }]

  depends_on = [cloudflare_email_routing_dns.app]
}

# Made in the dashboard; imported so it isn't duplicated (two DMARC records void both). Reject: only Email Sending sends as the domain.
import {
  to = cloudflare_dns_record.dmarc
  id = "${data.cloudflare_zone.app.id}/5abd7435f01c64cd75d6df3950588e7d"
}

resource "cloudflare_dns_record" "dmarc" {
  zone_id = data.cloudflare_zone.app.id
  name    = "_dmarc.${var.app_zone_name}"
  type    = "TXT"
  ttl     = 1
  content = "\"v=DMARC1; p=reject; rua=mailto:bba2e499007448e7a1b0b7b949d184e9@dmarc-reports.cloudflare.net\""
}
