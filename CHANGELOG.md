# Changelog

Versions follow [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.
Each release has a git tag `vX.Y.Z` on `main`.

## [Unreleased]

### Added
- Appeal feature (branch `feature/appeal`): every verdict can be appealed. The appeal is compared with the
  previous score (granted / denied / contempt), counted per original report, and the judge adds a message
  from the 3rd appeal on. Additive DB migration 2 (nullable appeal columns on `messages`).

## [1.0.0] - 2026-10-22

### Added
- Bug Report Court: paste a defect report and get a rule-based verdict (score 0–10, charges, sentence,
  "How to fix" template).
- Case Files sidebar, courts, judges (with management), Sarcasm/Strictness settings saved per case.
- Hall of Fame / Shame.
- Railway PostgreSQL with automatic migrations and idempotent CSV seed.
- Unit tests for the judging engine.

[Unreleased]: https://github.com/ArtoVaas/08ClaudeHArjutus/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ArtoVaas/08ClaudeHArjutus/releases/tag/v1.0.0
