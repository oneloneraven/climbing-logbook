# The identity stack, coraxia, owns the register widget now (#1707).
removed {
  from = cloudflare_turnstile_widget.register
  lifecycle {
    destroy = false
  }
}
