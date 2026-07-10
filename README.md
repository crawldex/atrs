# atrs

[![CI](https://github.com/crawldex/atrs/actions/workflows/ci.yml/badge.svg)](https://github.com/crawldex/atrs/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

21% of measured CrawlDex site-task rows need a person nearby before completion (n=8,401, source: https://crawldex.com/board.json). Use Agent Trust Record schemas and dependency-free validators for CrawlDex-compatible trust records.

ATRS is the public schema and dependency-free validator package for CrawlDex Agent Trust Records. A record tells an agent whether a public website task is likely to be reachable, whether a person must stay present, what evidence supports that answer, and how to dispute or improve the record.

```bash
npm install @crawldex/atrs
```

```ts
import { validateRecord, validateFeedback } from "@crawldex/atrs";

const record = await fetch("https://crawldex.com/api/v1/trust-record/example.com/account.cancel").then((res) => res.json());
const result = validateRecord(record);
if (!result.valid) {
  throw new Error(result.errors.join("\n"));
}

validateFeedback({
  record_id: record.record_id,
  action_taken: "followed",
  task_attempted: true
});
```

## Package Contents

- `schemas/record-0.1.schema.json` - Agent Trust Record schema.
- `schemas/feedback-0.1.schema.json` - structured decision echo and outcome status schema.
- `schemas/site-declaration-0.1.md` - publisher-facing declaration draft for WP-5B.
- `src/index.ts` - dependency-free reference validators and schema loaders.
- `fixtures/` - compact examples for proceed, handoff, user-needed, unknown, and site-level records.

## Current Implementations

CrawlDex is the only conforming implementation listed at this stage. Third-party implementations should open an issue or RFC before claiming compatibility so fixtures, validators, and drift tests can be added here.

## Feedback Shape

Feedback intentionally carries only structured telemetry:

- decision echo: `record_id`, `action_taken`, `task_attempted`
- outcome status: `record_id`, `outcome`, `task_attempted`, optional `redaction_status`

It does not accept free text, URLs, emails, account identifiers, raw traces, screenshots, DOM dumps, cookies, prompts, or private task content.

## Versioning

Version `0.1` is pre-1.0 and additive-first. Breaking record-shape changes require an RFC, a new schema filename, fixtures, and compatibility notes.

This mirror is generated from the canonical CrawlDex monorepo. Open issues and pull requests here; maintainers port accepted changes upstream.
