# PR #51 — second pass, schema only

Source commit: `d9628cdfa2cc86823faf312007b402a39f85926b`. Preview: https://805-a00tj01an-805-shutters.vercel.app (Vercel `dpl_E5cdfVcdUJotWAeLwKttAQjJsfcM`, Ready). Production baseline remains `7f2f3022ff3f6d2045bdfd03e474aefbee4287c9`. No merge or production deployment.

## Applied changes

Removed the homepage and /shades/ schema exceptions. The same normalization now applies to all 152 sitemap pages. The shared script remains server rendered and preserves unrelated nonsitemap routes. Removed the now-unused path argument from schema serializers; their output is otherwise unchanged. Added/updated server-rendering and identity regression tests for the newly included routes.

- All 152 complete business nodes are identical (one unique serialized node hash), with the same established ID `https://www.805shutters.com#local-business`.
- Since round 1, only / and /shades/ changed JSON-LD. Compared with production, all 152 pages have the approved schema changes.
- Founder/owner, hours, $$, extra directories, free-consultation prices and descriptive claims remain unchanged. No street address or geo was inferred or added. No visible content, titles, H1s, metadata, links, sitemap entries or AI files changed.

## Before/after on both newly included pages

| Field | Before | After |
| --- | --- | --- |
| name / email | 805 Shutters / 805@805shutters.com | Same |
| @id | https://www.805shutters.com#local-business | Same established entity ID |
| telephone, contactPoint.telephone | 805-806-9344 | +1-805-806-9344 |
| business url | https://www.805shutters.com | https://www.805shutters.com/ |
| areaServed / contactPoint.areaServed | 15 City nodes including Santa Clarita | Ventura County AdministrativeArea +14 approved Place nodes |
| serviceArea.name | Ventura County, North Los Angeles County, and Santa Clarita | Ventura County |
| broad catalog service areaServed | Ventura County, North Los Angeles County, and Santa Clarita | County +14 approved areas |
| sameAs | Existing four profiles with Instagram/Maps variants, plus five directory URLs | Exact four supplied profile URLs, plus unchanged five directory URLs |
| hasMap | https://www.google.com/maps?cid=14597332202667384985 | https://maps.google.com/?cid=14597332202667384985 |
| makesOffer | Five strings | Five Offer objects, each containing a named Service; no prices added |
| /shades/ Service.provider | Partial repeated business fields | @id reference to the shared complete business |
| /shades/ Service.areaServed | Broad 15-city coverage including Santa Clarita | County +14 approved areas |
| foundingDate / address | 1995 / absent | Unchanged |

Approved areas: Oxnard, Ventura, Camarillo, Ojai, Simi Valley, Port Hueneme, Thousand Oaks, Fillmore, Moorpark, Oak Park, Westlake Village, Santa Paula, Santa Rosa Valley, Newbury Park. Westlake Village is retained without assigning it a false county containment relation.

Full payloads: [homepage before](homepage-before.json), [homepage after](homepage-after.json), [shades before](shades-before.json), [shades after](shades-after.json). [Every schema field change against production](round2-schema-changes.csv).

## Verification

- Unit suite: 9,098 passed, 28 skipped; 718 test files passed, five skipped; 28.62 seconds locally.
- Typecheck and production build passed.
- Local built-site integrity crawl: four tests passed; 152 sitemap pages /153 targets; 4.68 seconds including test harness.
- Deployed preview, fetched with 805-scoped `vercel curl`, keeping preview protection enabled: **152/152 HTTP 200; 292/292 JSON-LD blocks parsed**.
- All 152 pages passed business identity/coverage/profile checks. All 152 remain free of Review, AggregateRating, review and aggregateRating markup.
- Visible markup, titles, H1s and metadata unchanged on **152/152**, compared with captured production. Excluded only JSON-LD and the previously approved deployment-generated differences: executable/hydration/analytics scripts, Next asset references, deployment IDs and generated CSS-module/font hash tokens. Text, links, headings, metadata and other attributes remain in the comparison.
- [Per-page results and original response hashes](round2-preview-validation.json).
- GitHub CI runs against the local build; the final PR-head status is reported on the PR checks and in the handoff. No claim of green is made before that final run completes.

## Actual external validators — 2026-09-25

Submitted each page's full captured **preview HTML** in CODE mode to Google Rich Results Test and Schema.org Validator. This tests the proposed server HTML without disabling preview authentication. These were actual browser submissions, not substitutes based on our own schema checker. URL-mode crawl/accessibility is not certified by code-mode testing. Google showed the 805 Shutters account `805shutters@gmail.com`; no MTS login was used.

| Page | Google Rich Results Test | Schema.org Validator |
| --- | --- | --- |
| / | [2 valid items](https://search.google.com/test/rich-results/result?id=Lm8L1Fa4ZWb7B3TR2RT--g): Local businesses, Organization; zero critical errors; one LocalBusiness non-critical warning, `Missing field "address" (optional)` | 0 errors, 0 warnings; WebSite root including the nested business |
| /shades/ | [3 valid items](https://search.google.com/test/rich-results/result?id=wAdc1bfX6QcdSlGUWfkQFA): Breadcrumbs, Local businesses, Organization; zero critical errors; one LocalBusiness non-critical warning, `Missing field "address" (optional)` | 0 errors, 0 warnings; WebPage and FAQPage roots |
| /shutters/ | [3 valid items](https://search.google.com/test/rich-results/result?id=3rKfYzrsCePFaUDY-nwTHg): Breadcrumbs, Local businesses, Organization; zero critical errors; one LocalBusiness non-critical warning, `Missing field "address" (optional)` | 0 errors, 0 warnings; WebPage and FAQPage roots |

The actual Google tool labels address **optional/non-critical** and the items valid. Google's [published LocalBusiness documentation](https://developers.google.com/search/docs/appearance/structured-data/local-business#structured-data-type-definitions) still lists address as required. This discrepancy is recorded rather than calling the observed warning an error or promising eligibility. Schema.org's zero errors does not verify claims, entity ownership, or Google feature eligibility. Google's Organization and LocalBusiness result categories refer to the same entity, not two businesses.

**Address requirement:** To satisfy Google's published requirement, Mike must supply an accurate physical business PostalAddress (street, city, state, ZIP and country) approved for publication; no service-area-business exception is documented, although today's test accepts omission with a warning.

## Decision tables — proposals only

- [All exact outside-county phrases and proposed replacements on the 11 documented pages](OUTSIDE-COUNTY-PROPOSALS.md), with a [CSV](outside-county-proposals.csv). Covers 171 distinct text/field occurrences, preserving exact current wording.
- [Every current unverified claim value, page membership and keep/remove recommendation](UNVERIFIED-CLAIMS.md), plus the [complete per-page ledger](unverified-claims-pages.csv).

The earlier 11-page count concerned remaining **schema** geography. The shared visible footer still contains the old broad coverage on all 152 pages. The two newly included pages' schema coverage is corrected; their visible wording remains. Nine pages still have outside-county schema descriptions or specific-city references: the two consultation pages and seven Santa Clarita pages. We do not silently contradict those pages' visible content by changing their descriptions only.

## Waiting on Mike

1. Approve or revise the proposed visible service-area wording, including the shared footer; keep Westlake Village.
2. Confirm actual hours, price range if desired, founder/current owner and family-owned status; verify the five directory identities, and confirm the free-consultation offer. Recommendations are in the table; nothing was removed.
3. Decide whether to keep the address private and accept the documented gap, or provide a real address approved for publication. Do not invent one.
4. Keep/merge decisions for Santa Clarita city pages remain on hold for 805-only Search Console data. No duplicate county rewrites, redirects or page deletions are proposed for immediate implementation.
5. Approve the final reviewed PR before any merge. This pass does not merge or deploy production.
