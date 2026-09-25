# Validation

Baseline: production commit `7f2f3022ff3f6d2045bdfd03e474aefbee4287c9`, captured with direct curl on 2026-09-25.

- Full unit suite: 9,094 passed, 28 skipped. Five subsequently added server-renderer tests also passed.
- Focused identity and existing schema tests: 11 passed (included in the full suite).
- Typecheck and production build passed.
- Local CI crawl: 152 sitemap pages / 153 unique targets; all four tests passed.
- Local built HTML: all 152 pages returned 200; every JSON-LD block parsed; exactly 150 pages changed schema. Homepage and /shades/ JSON-LD stayed identical.
- Visible HTML markup, links and metadata remained identical on all 152 pages after excluding JSON-LD, executable scripts/hydration/analytics, Next asset links, deployment IDs, and generated CSS-module/font hash tokens. The normalization retains the module name, style name and all other attributes/text; no stylesheet/source styling was changed.
- [Before example: /shutters/](example-before.json) and [after example](example-after.json) retain full payloads for review.

Preview verification pending. This PR must not be merged by this task.
