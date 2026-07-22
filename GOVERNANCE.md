# ATRS Governance

ATRS changes are governed as a standards surface, not as CrawlDex product code.

## Change Rules

- Record and feedback schemas are source-of-truth artifacts.
- Runtime CrawlDex trust-record output must validate against the shipped record schema before release.
- Feedback schemas must stay structured and must not accept free text, URLs, PII-shaped fields, raw traces, screenshots, DOM dumps, cookies, prompts, or private task content.
- New enum values require fixtures, validator tests, and a migration note.
- Breaking schema changes require an RFC and a new schema filename.

## Compatibility

The package has no runtime dependencies so agents can validate records without pulling CrawlDex server code. Implementations should treat unknown fields as invalid for the pinned schema version and should explicitly upgrade when adopting a new schema.

## Implementations

CrawlDex is currently the only listed implementation. Compatibility claims from other projects should be added in `IMPLEMENTATIONS.md` after fixtures and tests prove the claim.
