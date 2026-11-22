# November audit implementation and release gate

Base production commit: `6915a6666605123fb4c250049ebbf1f9a4683d95`.
Repository: `805shutters/805Shutters.com`. Vercel project: `805`.

**Do not merge or publish the UI changes until Mike approves the visual preview.**

## Confirmed baseline

The live homepage uses the editorial image `recent-two-story-arch-plantation-shutters-wide.jpg` on its first screen. The later carousel is a separate component. At 390px the fixed header extends to y=184 while the hero kicker begins at y=110. At 1440px the header extends to y=252 while the kicker begins at y=203.

The live Yelp endpoint reports `configured: false` and returns no reviews. The supplied owner link is `https://biz.yelp.com/r2r/JRTEVI7fB_mn_HGKL6asdg`. The owner subsequently supplied a screenshot containing Melitta’s November 17 review and Jen D.’s October 9 review. Exact excerpts, displayed names, dates, and individual star ratings are now used with public Yelp profile attribution. Individual review permalinks were not visible.

## Implementation

- Editorial hero delivered with responsive optimized sources, intrinsic dimensions, eager loading, and high fetch priority. Other editorial images lazy-load.
- Marketing image component supplies real dimensions and content-versioned URLs for 151 assets; the prebuild generator updates the manifest when image bytes change.
- Responsive image delivery across marketing page sections, service cards, and city photo sections. AVIF/WebP enabled.
- Below-fold video posters wait until near the viewport; playback respects reduced motion. Removed duplicate carousel CSS background downloads and unnecessary secondary font preloads.
- Lower-page photo-flow and recent-work images no longer compete at high priority. The later carousel has a deterministic initial image and loads only its active slide.
- One-day browser cache plus stale-while-revalidate for image/brand sources. Replacements used by optimized marketing images receive new content-version URLs. Unversioned legacy sources may retain the prior version for the cache period.
- Header size measurement and responsive fallback spacing separate the first-screen copy from fixed navigation.
- Descriptive homepage heading and proof line using existing published business facts.
- Reviews component on homepage and reviews page renders two actual Yelp excerpts from the owner-provided screenshot without an additional widget or API dependency. No aggregate rating/count or self-serving review schema is added.
- Skip-to-main link, darker accent, footer Yelp contrast, booking accessible names beginning with the visible day, and navigable product sub-items.
- Locality-only PostalAddress. No private street address or fabricated storefront/coordinates. Preserve established schema IDs and existing verified directory profile normalization.
- Schema reservation action points directly to `/book-consultation/`.
- Meta page views queue immediately but load their browser script after load/idle; contacts and conversions expedite loading with existing deduplication IDs preserved. Google configurations remain queued immediately. The fallback library waits until load/idle and reuses a Google tag library already inserted by GTM. Runtime inspection found GTM can dynamically load the same GA4 library even though its identifier was absent from the initial container response.
- Rewrite verbose editorial descriptions and booking metadata. Omit unsupported shared sitemap modification dates; retain known editorial/answer-page dates.
- Canonical-host page redirects combine www and trailing slash normalization, excluding assets/API paths.
- SAMEORIGIN frame protection on core public marketing pages. Permissions policy disables browsing topics. Restrictive object/base/frame policy is report-only; it does not block production dependencies.

## Remaining decisions / evidence

1. Two actual Yelp excerpts are included. More excerpts and individual permalinks can be added when accessible. Provider configuration is not changed; no secrets requested in chat.
2. Genuine city-specific installations, photos, and review attribution. Existing assets are not falsely assigned to individual cities. No fabricated local projects.
3. Current search/lead evidence and a concrete redirect map before new city-page consolidation. September records already implemented ten consolidations and explicitly held two city shade pages; preserve those decisions. No additional noindex or page mergers in this change.
4. A coordinated end-to-end test booking and Google/Meta event-manager verification. Automated tests cover booking recovery and conversion deduplication, but no real appointment has been submitted.
5. HSTS includeSubDomains requires confirming HTTPS coverage for every affected subdomain. Do not enable it speculatively.
6. Short pages are not automatically defective. `/official/` is a focused identity-verification utility. Expand project/city stories when genuine evidence is available rather than padding to a word-count target.
7. Real-user performance results require traffic after release. Lab output is not a substitute for CrUX/field metrics.

## Rollback

Revert the audit implementation commit and redeploy the previously approved version. No migrations, stored business data, booking records, or page deletions are involved.

## Validation evidence

- Draft PR: https://github.com/805shutters/805Shutters.com/pull/103. Preview access remains protected; no public sharing grant was created. Production is unchanged pending visual approval.
- 44 focused regression tests pass across editorial image delivery, Meta queue/loading/deduplication, booking recovery, structured data, and sitemap generation. The historical quote evidence test also passes after fetching its pinned historical commit.
- Browser layout checks at 390/1280/1440 pixels: no header overlap, no horizontal overflow, no page exceptions, and keyboard skip-link focus succeeds.
- Shutters/gallery/reviews/booking routes return 200 locally. Checked image counts: 29/58/3/3; all have dimensions and no broken loaded image sources.
- Hero source: 230,105 bytes. Optimized AVIF: 29,677 bytes for the tall mobile crop and 37,858 bytes at desktop sizing. These asset sizes are not field-performance measurements.
- Local redirect requests with apex Host: both `/shutters` and `/shutters/` return a single permanent 308 to `https://www.805shutters.com/shutters/`; `/shutters/camarillo/` preserves its slash. Asset URLs retain their file extension path.
- Full `npm test` was executed: 10,835 passed, 14 failed, 100 skipped initially. All failing suites subsequently passed after correcting changed expectations, restoring the unrelated CRM markup, fetching the pinned historical commit, and isolating slow database tests from concurrent builds. Isolated reruns: 93 passed across nine slow suites, plus 59 passed and two skipped across ten regression suites. This is not a claim of a single all-green full-suite run.
- Typecheck and production build pass. Additional focused loading tests cover deferred video posters, reduced motion, and reuse/fallback of the Google library.
- Three local production-build mobile Lighthouse runs after offscreen-media changes: LCP 4.39s, 3.80s, 4.23s (median 4.23s), CLS 0 in all three; performance scores 62/65/65. These precede the final Google-library guard. This is near but not consistently under the first-round 4s target, and does not establish real-visitor Core Web Vitals. The earlier live baseline was measured under different conditions and is not a controlled before/after benchmark.
