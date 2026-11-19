output "d1_database_id" {
  description = "Read by infra.yml to keep wrangler.jsonc's d1_databases id in sync."
  value       = cloudflare_d1_database.logbook.id
}
