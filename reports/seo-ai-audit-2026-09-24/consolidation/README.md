# Geographic consolidation review — September 25, 2026

Scope: 10 independent candidates implemented; two shade-city candidates are explicitly excluded and marked HOLD by Mike. No candidate meets the performance/protection skip criteria. No merge or production deployment is authorized.

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
| /shades/thousand-oaks-ca/ | NR / NR | NR / NR | discovered-not-indexed | https://www.805shutters.com/shades/ | HOLD — Explicitly excluded by Mike; keep this page and its sitemap entry, with /shades/ unchanged. |
| /blinds/thousand-oaks-ca/ | NR / NR | NR / NR | discovered-not-indexed | https://www.805shutters.com/blinds/ | 301 — Repeated city-template text; no performance row in either period. |
| /shades/ventura-ca/ | NR / NR | NR / NR | discovered-not-indexed | https://www.805shutters.com/shades/ | HOLD — Explicitly excluded by Mike; keep this page and its sitemap entry, with /shades/ unchanged. |
| /custom-drapery-curtains-ventura-county/ | NR / NR | NR / NR | discovered-not-indexed | https://www.805shutters.com/drapery/ | 301 — Overlapping drapery intent; established hub has 3 clicks and 857 impressions. |

## Implementation

- Permanent 301 rules in next.config.mjs before slash and host canonicalization; final www HTTPS targets; both source slash variants. No new redirect system.
- Shared sitemap builder excludes consolidated URLs from /sitemap.xml and /page-sitemap.xml. Source pages are retained; no noindex tags added.
- Existing anchor destinations updated to hubs without changing anchor wording or page copy. Homepage and /shades/ remain untouched.
- AnswerPage React keys include the anchor label because two existing links now share one hub URL; this prevents duplicate keys and does not change rendered content.
- Redirect regression tests cover both slash variants and false matches. The existing local-build CI integrity step now runs these redirect tests too. Sitemap tests ensure sources are excluded and hubs retained.

## Validation

Focused redirect tests: 55 passed. Focused sitemap tests: 5 passed. The source commit is `f5395f711059494b698b33bfc26cb745de3516d4`. Final preview verification is recorded below; GitHub CI is green on this exact commit (run 36176797216, build job completed September 25 at 19:06:25 UTC; 7m51s). The clean local production build also passed, including TypeScript. The first local attempt used an incomplete reused dependency installation; npm ci in the isolated worktree resolved that environment issue without source changes.

## Rollback

Do not roll back automatically. If a later merge is approved and rollback is needed, revert this PR through a reviewed PR to restore the prior redirects, sitemap entries and original hrefs. No content or source pages are deleted by this change.

## Preview verification completed

PR: https://github.com/805shutters/805Shutters.com/pull/54 (ready for review, not merged).
Preview: https://805-o2mk502tl-805-shutters.vercel.app (Ready, dpl_365f3v7SkWfh3DBNUkvj6aWdD6Ld).
Tested source commit: f5395f711059494b698b33bfc26cb745de3516d4.

- All **20 source variants** return exactly **301**, with `Location` equal to their final `https://www.805shutters.com/…/` hub. Each live destination is **200 with no further Location**, and its preview counterpart is also 200. See [redirect-checks.csv](redirect-checks.csv).
- Both `/sitemap.xml` and `/page-sitemap.xml` contain exactly **142 URLs**, equal to the original 152 minus these ten candidates. No other entry added or removed. The two held shade-city pages remain 200 and remain in the sitemap.
- All **142 remaining sitemap pages return 200**. Normalized HTML is identical after only the four authorized href substitutions. This comparison retains visible copy, anchors/labels, titles, H1s, other metadata, JSON-LD, images and layout attributes; it excludes executable hydration/analytics scripts, Next.js asset links, deployment IDs and CSS module build hashes. Raw HTML is not claimed byte-identical. See [content-comparison.csv](content-comparison.csv) and [comparison.json](comparison.json).
- Homepage and `/shades/` have no href changes and their normalized full page HTML remains unchanged.
- No protected URL or hub is redirected. All four hub destinations remain in the sitemap. Hub wording/content is unchanged; the single `/drapery/` incoming href is the only hub anchor adjustment.
- The source pages remain in the repository. No noindex directives, content rewrites, ownership-token changes, or production release were made.

## Every incoming href changed

| Page | Old href | New href |
|---|---|---|
| /drapery/ | /drapery/oak-park-ca/ | https://www.805shutters.com/drapery/ |
| /blinds-near-me-ventura-county/ | /blinds/moorpark-ca/ | https://www.805shutters.com/blinds/ |
| /blinds-near-me-ventura-county/ | /blinds/thousand-oaks-ca/ | https://www.805shutters.com/blinds/ |
| /window-treatment-company-near-me-ventura-county/ | /custom-drapery-curtains-ventura-county/ | https://www.805shutters.com/drapery/ |

## Confirmed exclusions

Mike explicitly excluded `/shades/thousand-oaks-ca/` and `/shades/ventura-ca/`. Both are HOLD, remain 200 and in the sitemap, and retain existing incoming links. `/shades/` remains untouched. Proceed with the other ten candidates only; do not merge this PR.

## AI-feed review follow-up

The subsequent review also removes consolidated URLs from AI feeds and changes the four updated HTML hrefs to relative hub paths. See [feed-review.md](feed-review.md) for the exact scope, homepage path-array source and local-build CI checks. Earlier preview details above describe the original f5395f71 verification; final preview and CI evidence are recorded in the PR description.
