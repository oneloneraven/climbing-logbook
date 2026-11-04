# Explicit, so nothing dynamic or authenticated is cached even if the Worker misses a Cache-Control header.

resource "cloudflare_zone_setting" "app_cache_level" {
  zone_id    = data.cloudflare_zone.app.id
  setting_id = "cache_level"
  value      = "basic"
}

resource "cloudflare_ruleset" "app_cache_rules" {
  zone_id     = data.cloudflare_zone.app.id
  kind        = "zone"
  phase       = "http_request_cache_settings"
  name        = "climbing-logbook cache rules"
  description = "Bypass API/auth, cache static assets (#528)"

  rules = [
    {
      # Auth is under /-/api/ too. /login and /register are static, so they stay cacheable.
      description = "Bypass cache - API and auth endpoints"
      expression  = "starts_with(http.request.uri.path, \"/-/api/\")"
      action      = "set_cache_settings"
      action_parameters = {
        cache = false
      }
    },
    {
      description = "Cache static assets - 30d edge, 1y browser"
      expression  = "(http.request.uri.path.extension in {\"css\" \"js\" \"png\" \"jpg\" \"jpeg\" \"gif\" \"svg\" \"webp\" \"woff\" \"woff2\" \"ttf\" \"eot\" \"ico\" \"map\"})"
      action      = "set_cache_settings"
      action_parameters = {
        cache = true
        edge_ttl = {
          mode    = "override_origin"
          default = 2592000
        }
        browser_ttl = {
          mode    = "override_origin"
          default = 31536000
        }
      }
    }
  ]
}
