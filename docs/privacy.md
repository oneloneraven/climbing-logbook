# Privacy

Rules for handling personal data while building this project. What is
processed, why, and by whom is recorded in [data protection](data-protection.md);
the assessment of the risks is in the [DPIA](dpia.md). This page does not
restate either.

- **Collect the minimum.** Every piece of personal data has a stated purpose
  in [data protection](data-protection.md) before it's collected.
- **No personal data in logs**, URLs or query strings, analytics events,
  error reports, test fixtures or the repository.
- **No email addresses published** in the repository, the site or DNS
  records. Scrapers harvest them.
- **No provider or supplier names, and no detailed architecture, in
  user-facing copy.** Name what a feature does, not what it runs on.
- **One person's raw data is never exposed to another.** Features that
  combine data across people use anonymised aggregates only.
- **Test setup never reaches real external services.** Local secrets files
  can hold real keys, so bulk test setup uses fakes or test modes.
- **Telemetry is aggregate and minimal.** Prefer approaches that collect
  nothing personal.
- **A new processor** (any third party that receives personal data) is added
  to [data protection](data-protection.md) and the
  [threat model](threat-model.md) in the same PR.
