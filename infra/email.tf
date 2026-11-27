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

# Made in the dashboard when Resend was set up; reject once only Resend sends as the domain.
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

# Resend's sending domain: the bounce MX and SPF on send., and the DKIM key it signs with.
import {
  to = cloudflare_dns_record.resend_bounce_mx
  id = "${data.cloudflare_zone.app.id}/787e5916c3fa5f2cb4291bb3701c8c91"
}

resource "cloudflare_dns_record" "resend_bounce_mx" {
  zone_id  = data.cloudflare_zone.app.id
  name     = "send.${var.app_zone_name}"
  type     = "MX"
  ttl      = 3600
  priority = 10
  content  = "feedback-smtp.eu-west-1.amazonses.com"

  lifecycle {
    prevent_destroy = true
  }
}

import {
  to = cloudflare_dns_record.resend_spf
  id = "${data.cloudflare_zone.app.id}/6898ae3d2fa3eae84f3bbe3b86e2ad0b"
}

resource "cloudflare_dns_record" "resend_spf" {
  zone_id = data.cloudflare_zone.app.id
  name    = "send.${var.app_zone_name}"
  type    = "TXT"
  ttl     = 3600
  content = "\"v=spf1 include:amazonses.com ~all\""

  lifecycle {
    prevent_destroy = true
  }
}

import {
  to = cloudflare_dns_record.resend_dkim
  id = "${data.cloudflare_zone.app.id}/29ca1f1b1974c701711f7795c5bcd15a"
}

resource "cloudflare_dns_record" "resend_dkim" {
  zone_id = data.cloudflare_zone.app.id
  name    = "resend._domainkey.${var.app_zone_name}"
  type    = "TXT"
  ttl     = 3600
  content = "\"v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC3a9eWtmBUjvv50VN6dgj7/O8b/fnCMNqGI+gPiKstst1XP6/y8NuzqPsbpGvJQkiYVRAfbjR988+pk81yBxGNtIHGdsNkhX+CP5mTmBwrHFjuA8o4ssRWLptUzmF9cFqppX5jYkft75OQUvoAaTmgt/JQ54MFfJnlU/RsDZPPcQIDAQAB\""

  lifecycle {
    prevent_destroy = true
  }
}

# Onboarded in the dashboard (#1702), which added the cf-bounce MX, SPF and DKIM records. Preview stays off so message content isn't kept.
import {
  to = cloudflare_email_sending_subdomain.app
  id = "${data.cloudflare_zone.app.id}/ef0eefd4682a486c8df42efd8409ace2"
}

resource "cloudflare_email_sending_subdomain" "app" {
  zone_id                    = data.cloudflare_zone.app.id
  name                       = var.app_zone_name
  preview_enabled            = false
  drop_suppressed_recipients = false
}
