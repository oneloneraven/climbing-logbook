CREATE TABLE beta_samples (
  text                TEXT PRIMARY KEY,
  interpreter_version TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_beta_samples_created_at ON beta_samples(created_at);
