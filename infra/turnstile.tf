# Managed mode: invisible unless Cloudflare's risk signals call for an interactive challenge.
resource "cloudflare_turnstile_widget" "register" {
  account_id = var.cloudflare_account_id
  name       = "climbing-logbook-register"
  # Must match client/turnstile.js's REAL_SITEKEY_HOSTNAMES. Sorted: Cloudflare returns it sorted, so any other order plans as a change.
  domains = sort([var.app_zone_name, "beta.${var.app_zone_name}", "my.${var.app_zone_name}"])
  mode    = "managed"

  # A replacement would change the secret, which is set by hand per environment (outputs.tf), breaking sign-up.
  lifecycle {
    prevent_destroy = true
  }
}
