# ATRS Site Declaration 0.1

`/.well-known/agent-trust.json` lets a publisher describe task surfaces for agents without changing robots.txt or llms.txt.

robots.txt covers crawl permission. llms.txt helps language models find useful content. The site declaration is narrower: it describes task and transaction policy for agents, including where agents should start, when a user must be present, and which support channel is official.

This WP defines the declaration only. CrawlDex does not ingest, score, rank, or trust declarations until WP-5B.

## Shape

```json
{
  "atrs_site_declaration_version": "0.1",
  "agents_welcome": "conditional",
  "tasks": [
    {
      "task": "subscriptions.cancel",
      "supported": true,
      "entry_url": "https://example.com/account/subscription",
      "user_present_required": true,
      "user_present_reasons": ["authentication", "final_confirmation"],
      "support_channels": ["https://example.com/support"],
      "claim_binding": {
        "method": "dns_txt",
        "value": "crawldex-claim=..."
      }
    }
  ],
  "updated_at": "2026-07-02T00:00:00Z"
}
```

## Fields

- `agents_welcome`: `true`, `false`, or `conditional`.
- `tasks[].task`: CrawlDex task key or another ATRS-compatible task key.
- `tasks[].supported`: whether the publisher exposes a route for the task.
- `tasks[].entry_url`: official starting URL for the task.
- `tasks[].user_present_required`: whether the route requires a person nearby.
- `tasks[].user_present_reasons`: short reason codes, not private user data.
- `tasks[].support_channels`: official support URLs or channel identifiers.
- `tasks[].claim_binding`: optional domain-claim proof pointer.

Declarations are publisher claims. They must render separately from observed CrawlDex evidence and must not directly change scores.
