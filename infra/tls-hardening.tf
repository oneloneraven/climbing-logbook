
resource "cloudflare_zone_setting" "app_min_tls_version" {
  zone_id    = data.cloudflare_zone.app.id
  setting_id = "min_tls_version"
  value      = "1.2"
}

# Not full_strict: it needs a certificate at the origin, and the placeholder origin has none (dns.tf).

# include_subdomains covers my. and beta. too.
resource "cloudflare_zone_setting" "app_hsts" {
  zone_id    = data.cloudflare_zone.app.id
  setting_id = "security_header"
  value = {
    strict_transport_security = {
      enabled            = true
      max_age            = 31536000
      include_subdomains = true
      nosniff            = true
      preload            = false
    }
  }
}

# The DS record is added at the registrar by hand: infra/README.md.
resource "cloudflare_zone_dnssec" "app" {
  zone_id = data.cloudflare_zone.app.id
  status  = "active"
}

output "app_dnssec_ds_record" {
  description = "DS record to add at the domain registrar once DNSSEC is active (#527) -- infra/README.md documents this as a one-time manual step."
  value       = cloudflare_zone_dnssec.app.ds
}

resource "cloudflare_dns_record" "app_www" {
  zone_id = data.cloudflare_zone.app.id
  name    = "www.${var.app_zone_name}"
  type    = "CNAME"
  content = var.app_zone_name
  ttl     = 1
  proxied = true
  comment = "#527 -- www redirects to the apex, doesn't serve traffic itself."

  # prevent_destroy: docs/infra-architecture.md.
  lifecycle {
    prevent_destroy = true
  }
}

# An allowlist, so the Worker never runs for apex pages; test/scripts/apex-redirect-rule.test.js checks it's complete.
locals {
  app_hosts               = ["my.${var.app_zone_name}", "beta.${var.app_zone_name}"]
  apex_only_exact_paths   = ["/", "/help", "/login", "/register", "/reset-password", "/demo-picker.js"]
  apex_only_path_prefixes = ["/help/", "/login/", "/register/", "/reset-password/"]
}

# Cloudflare allows one entrypoint per phase, so every redirect rule lives here.
resource "cloudflare_ruleset" "app_www_redirect" {
  zone_id     = data.cloudflare_zone.app.id
  kind        = "zone"
  phase       = "http_request_dynamic_redirect"
  name        = "www to apex redirect"
  description = "www.climbinglogbook.com -> climbinglogbook.com (#527); apex pages off the app hosts (#985)"

  rules = [
    {
      description = "Redirect www to the apex, preserving path"
      expression  = "(http.host eq \"www.${var.app_zone_name}\")"
      action      = "redirect"
      action_parameters = {
        from_value = {
          status_code = 301
          target_url = {
            expression = "concat(\"https://${var.app_zone_name}\", http.request.uri.path)"
          }
        }
      }
    },
    {
      description = "Redirect apex-only pages on the app hosts to the apex, preserving path and query (#985)"
      expression  = "(http.host in {${join(" ", [for host in local.app_hosts : "\"${host}\""])}}) and (http.request.uri.path in {${join(" ", [for path in local.apex_only_exact_paths : "\"${path}\""])}} or ${join(" or ", [for prefix in local.apex_only_path_prefixes : "starts_with(http.request.uri.path, \"${prefix}\")"])})"
      action      = "redirect"
      action_parameters = {
        from_value = {
          status_code           = 301
          preserve_query_string = true
          target_url = {
            expression = "concat(\"https://${var.app_zone_name}\", http.request.uri.path)"
          }
        }
      }
    }
  ]
}

# Turned on in the dashboard before this file existed.
import {
  to = cloudflare_zone_setting.app_always_use_https
  id = "${data.cloudflare_zone.app.id}/always_use_https"
}

resource "cloudflare_zone_setting" "app_always_use_https" {
  zone_id    = data.cloudflare_zone.app.id
  setting_id = "always_use_https"
  value      = "on"
}
