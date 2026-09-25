# PR #51: approved final schema decisions

September 25, 2026. Supersedes the pending decisions in ROUND2.md, UNVERIFIED-CLAIMS.md, and OUTSIDE-COUNTY-PROPOSALS.md. This is a schema-only release; no visible wording, titles, H1s, metadata, footer, or geographic copy changes.

## Approved business facts

All 152 sitemap pages use the established `https://www.805shutters.com#local-business` entity. Name: 805 Shutters; telephone: +1-805-806-9344; email: 805@805shutters.com; URL: https://www.805shutters.com/; founding date: 1995.

Coverage includes Ventura County, Oxnard, Ventura, Camarillo, Ojai, Simi Valley, Port Hueneme, Thousand Oaks, Fillmore, Moorpark, Oak Park, Westlake Village, Santa Paula, Santa Rosa Valley, Newbury Park, Santa Clarita, and North Los Angeles County. The two restored areas apply to the business, contact point, and company-wide service coverage. Specific city services keep their specific city. The footer and all eleven previously flagged pages retain their original geographic wording.

Mike confirmed the existing Monday–Saturday 08:00–18:00 hours, $$ price range, Ken Hill as founder and owner, family-owned wording, and free consultation offers. All remain unchanged. No street address is supplied or inferred. The previously observed optional Google Rich Results Test address warning is accepted. No Review or AggregateRating markup is added.

## sameAs verification

Read-only checks of the public listings on September 25, 2026. No directory account was changed. The four supplied Facebook, Instagram, Yelp, and Google Maps URLs remain exactly as approved.

| Extra directory | Decision | Evidence / reason |
| --- | --- | --- |
| [MapQuest](https://www.mapquest.com/us/california/805-shutters-378112738) | Keep; use observed final URL | 805 Shutters, website 805shutters.com, click-to-call `tel:+18058069344`. The older `/805-shutters-shades-blinds-378112738` URL redirects here. |
| [Yahoo Local](https://local.yahoo.com/info-225163327-805-shutters/) | Keep; use observed final URL | 805 Shutters-Shades-Blinds, website 805shutters.com, visible phone (805) 806-9344. The existing URL redirects to the trailing-slash version. |
| [Chamber of Commerce](https://www.chamberofcommerce.com/business-directory/california/santa-rosa-valley/window-treatment-store/2026058550-805-shutters-shades-blinds) | Keep | Exact listing identifies 805 Shutters Shades & Blinds, links 805shutters.com, and shows (805) 806-9344. A separate nearby-business listing has 805-630-0848; that is not the linked listing's contact number. |
| [2findlocal](https://www.2findlocal.com/b/15023840/805-shutters-shades-blinds-santa-rosa-valley-ca) | Keep | 805 Shutters Shades & Blinds, website 805shutters.com, visible phone 805-806-9344. |
| [BBB](https://www.bbb.org/us/ca/camarillo/profile/window-coverings/805-shutters-shades-blinds-1236-3001378) | Remove from sameAs | Correct business, website, Ken Hill owner, and primary phone (805) 806-9344, but its business contact details also show **Other Phone: (805) 491-8970**. Removed under the instruction to remove listings with a different phone; not classified as a different business. |

Uahot, AllBiz, and 805shuttersandshades.com were not in the rendered business sameAs list; all are excluded by the verified allowlist. Regression coverage injects those URLs and BBB into legacy data and verifies that none survives normalization. Final sameAs contains eight URLs: the four supplied profiles and four verified directories.

## Outside-listing follow-up only

These do not change the keep/remove decision based on business identity and phone, and were not copied into the website schema:

- Chamber of Commerce and 2findlocal show 805shutters@gmail.com, continuous/24-hour hours, and Santa Barbara County wording. They should be reconciled separately with the confirmed website facts.
- Yahoo Local also mentions Santa Barbara County in its description.
- BBB lists January 1, 2002 as business start date, in addition to its conflicting secondary phone. No external edits were made.

## Local verification completed

- Full suite: 718 test files passed; 9,100 tests passed, 28 skipped; 36.99 seconds.
- Production build and TypeScript check passed.
- Local-build public sitemap/internal-link crawl: all four tests passed; 152 pages and 153 distinct link targets checked; crawl 2.00 seconds (suite 5.15 seconds).
- Fresh live production baseline: all 152 pages returned 200 and matched the earlier audit's visible markup/metadata.

## Release checks

The identity regression covers coverage, contact identity, directory allowlist, verified claims, references, and schema property ranges. Full unit tests, typecheck, build, and local public-site integrity checks must pass. Before merging, compare preview to the production baseline over all 152 sitemap pages, excluding JSON-LD and deployment-generated scripts/assets. Require HTTP 200, parseable JSON-LD, the approved entity, preserved claims, and unchanged visible markup/metadata on every page. Merge only after the current head's GitHub CI succeeds, without admin bypass. After production deployment, repeat the 152-page checks and export the actual live homepage entity. Record the resulting preview/CI/deployment and live verification evidence in the PR and final report.
