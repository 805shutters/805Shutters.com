# Geographic consolidation review — September 25, 2026

Scope: 10 independent candidates implemented; two candidates linked from protected /shades/ are held pending Mike's clarification. No candidate meets the performance/protection skip criteria. No merge or production deployment is authorized.

Evidence: 805shutters@gmail.com, https://www.805shutters.com/ URL-prefix property. 3 months June 24–September 23; 28 days August 27–September 23. NR means not reported in the fully captured visible page table, not a measured zero. All 12 have NR in both periods and none appears in the 69 protected sitemap URLs. Index status is the September 20 report, not a new claim about today's index.

| Page | Clicks (3m / 28d) | Impressions (3m / 28d) | Index status | Target hub | Action / reason |
|---|---|---|---|---|---|
| /shutters/fillmore/ | NR / NR | NR / NR | discovered-not-indexed | https://www.805shutters.com/shutters/ | 301 — Repeated city-template text; no performance row in either period. |
| /blinds/fillmore-ca/ | NR / NR | NR / NR | crawled-not-indexed | https://www.805shutters.com/blinds/ | 301 — Repeated city-template text; no performance row in either period. |
| /blinds/moorpark-ca/ | NR / NR | NR / NR | discovered-not-indexed | https://www.805shutters.com/blinds/ | 301 — Repeated city-template text; no performance row in either period. |
| /blinds/oak-park-ca/ | NR / NR | NR / NR | discovered-not-indexed | https://www.805shutters.com/blinds/ | 301 — Repeated city-template text; no performance row in either period. |
| /drapery/oak-park-ca/ | NR / NR | NR / NR | indexed | https://www.805shutters.com/drapery/ | 301 — Repeated city-template text; no performance row in either period. |
| /shutters/santa-paula/ | NR / NR | NR / NR | discovered-not-indexed | https://www.805shutters.com/shutters/ | 301 — Repeated city-template text; no performance row in either period. |
| /shades/santa-paula-ca/ | NR / NR | NR / NR | discovered-not-indexed | https://www.805shutters.com/shades/ | 301 — Repeated city-template text; no performance row in either period. |
| /shades/simi-valley-ca/ | NR / NR | NR / NR | crawled-not-indexed | https://www.805shutters.com/shades/ | 301 — Repeated city-template text; no performance row in either period. |
| /shades/thousand-oaks-ca/ | NR / NR | NR / NR | discovered-not-indexed | https://www.805shutters.com/shades/ | HOLD — Protected /shades/ links here; needs approval for a href-only exception or must remain held. |
| /blinds/thousand-oaks-ca/ | NR / NR | NR / NR | discovered-not-indexed | https://www.805shutters.com/blinds/ | 301 — Repeated city-template text; no performance row in either period. |
| /shades/ventura-ca/ | NR / NR | NR / NR | discovered-not-indexed | https://www.805shutters.com/shades/ | HOLD — Protected /shades/ links here; needs approval for a href-only exception or must remain held. |
| /custom-drapery-curtains-ventura-county/ | NR / NR | NR / NR | discovered-not-indexed | https://www.805shutters.com/drapery/ | 301 — Overlapping drapery intent; established hub has 3 clicks and 857 impressions. |

## Implementation

- Permanent 301 rules in next.config.mjs before slash and host canonicalization; final www HTTPS targets; both source slash variants. No new redirect system.
- Shared sitemap builder excludes consolidated URLs from /sitemap.xml and /page-sitemap.xml. Source pages are retained; no noindex tags added.
- Existing anchor destinations updated to hubs without changing anchor wording or page copy. Homepage and /shades/ remain untouched pending the explicit question.
- AnswerPage React keys include the anchor label because two existing links now share one hub URL; this prevents duplicate keys and does not change rendered content.
- Redirect regression tests cover both slash variants and false matches. The existing local-build CI integrity step now runs these redirect tests too. Sitemap tests ensure sources are excluded and hubs retained.

## Validation

Focused redirect tests: 55 passed. Focused sitemap tests: 5 passed. Build/typecheck/preview comparison pending at initial PR creation. Final preview evidence will be added to this report before handoff.

## Rollback

Do not roll back automatically. If a later merge is approved and rollback is needed, revert this PR through a reviewed PR to restore the prior redirects, sitemap entries and original hrefs. No content or source pages are deleted by this change.
