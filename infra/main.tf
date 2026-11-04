terraform {
  required_version = ">= 1.10.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    betteruptime = {
      source  = "BetterStackHQ/better-uptime"
      version = "~> 0.22"
    }
  }

  # Credentials come from AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY at tofu init, never from this file.
  backend "s3" {
    bucket                      = "climbing-logbook-tfstate"
    key                         = "climbing-logbook/terraform.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
    endpoints = {
      s3 = "https://4f63d74beb21402b8622361525ab4868.r2.cloudflarestorage.com"
    }
  }
}

provider "cloudflare" {
  # Reads CLOUDFLARE_API_TOKEN from the environment.
}

provider "betteruptime" {
  api_token = var.betterstack_api_token
}
