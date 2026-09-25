# Validation

Baseline: production commit `7f2f3022ff3f6d2045bdfd03e474aefbee4287c9`, captured with direct curl on 2026-09-25.

- Full unit suite: 9,094 passed, 28 skipped. Five subsequently added server-renderer tests also passed.
- Focused identity and existing schema tests: 11 passed (included in the full suite).
- Typecheck and production build passed.
- Local CI crawl: 152 sitemap pages / 153 unique targets; all four tests passed.
- Local built HTML: all 152 pages returned 200; every JSON-LD block parsed; exactly 150 pages changed schema. Homepage and /shades/ JSON-LD stayed identical.
- Visible HTML markup, links and metadata remained identical on all 152 pages after excluding JSON-LD, executable scripts/hydration/analytics, Next asset links, deployment IDs, and generated CSS-module/font hash tokens. The normalization retains the module name, style name and all other attributes/text; no stylesheet/source styling was changed.
- [Before example: /shutters/](example-before.json) and [after example](example-after.json) retain full payloads for review.

## Deployed preview results

Source commit: `6f57033e64aa359a31f2bca3a2bec5eb58087e87`.
Preview: https://805-b14wl23cu-805-shutters.vercel.app
Vercel deployment: `dpl_C4ds1Qj6BgKYY6p27ay71hqBgT39`, target Preview, Ready.
Captured using `vercel curl` with 805 scope; deployment protection stayed enabled.

- 152/152 pages returned 200.
- 292/292 JSON-LD script blocks parsed (not strings inside hydration scripts).
- Exactly 150 pages changed JSON-LD; / and /shades/ schema are identical to production.
- All 150 editable business entities match the approved name, phone, email, URL, sameAs, 1995 founding date, county +14 areas, and no street address.
- Visible markup, links, titles, H1s and metadata are unchanged on all 152 pages under the stated runtime exclusions.
- Schema.org vocabulary domain/range checks: the only remaining findings are 10 makesOffer string entries on the two protected pages. No property-domain/typed-range findings remain on edited pages.
- [Every page's validation result and hashes](preview-validation.json), [every changed schema field](schema-changes.csv), [remaining vocabulary findings](preview-vocabulary-findings.csv).

### /shutters/ example (shared business node)

| Field | Before | After |
| --- | --- | --- |
| @id | https://www.805shutters.com#local-business | Same |
| name | 805 Shutters | Same |
| telephone | 805-806-9344 | +1-805-806-9344 |
| email | 805@805shutters.com | Same |
| url | https://www.805shutters.com | https://www.805shutters.com/ |
| serviceArea.name | Ventura County, North Los Angeles County, and Santa Clarita | Ventura County |
| areaServed | 15 City entries, including Santa Clarita | Ventura County +14 approved Place entries |
| sameAs | Equivalent Instagram and Maps URL variants | Exact four approved URLs; other existing directories retained |
| makesOffer | Five strings | Five Offer objects with the same Service names |

See linked full before/after payloads above for every field, including unchanged claims.

### Remaining geographic wording

Santa Clarita/Los Angeles still appears in schema on 11 pages: /, /shades/, /free-window-treatment-consultation/, /book-consultation/, and the seven Santa Clarita-specific pages listed in README. The two consultation pages contain existing descriptive/FAQ wording matching their visible content; it was not rewritten. Westlake Village remains throughout as explicitly approved, with its county-boundary caveat documented.

This PR remains unmerged. No production deployment was performed.
