# November audit implementation and release gate

Base production commit: `6915a6666605123fb4c250049ebbf1f9a4683d95`.
Repository: `805shutters/805Shutters.com`. Vercel project: `805`.

**Do not merge or publish the UI changes until Mike approves the visual preview.**

## Confirmed baseline

The live homepage uses the editorial image `recent-two-story-arch-plantation-shutters-wide.jpg` on its first screen. The later carousel is a separate component. At 390px the fixed header extends to y=184 while the hero kicker begins at y=110. At 1440px the header extends to y=252 while the kicker begins at y=203.

The live Yelp endpoint reports `configured: false` and returns no reviews. The supplied owner link is `https://biz.yelp.com/r2r/JRTEVI7fB_mn_HGKL6asdg`; no review text could be retrieved from it in this workspace. Never substitute invented quotations or ratings.

## Implementation

- Editorial hero delivered with responsive optimized sources, intrinsic dimensions, eager loading, and high fetch priority. Other editorial images lazy-load.
- Marketing image component supplies real dimensions and content-versioned URLs for 151 assets; the prebuild generator updates the manifest when image bytes change.
- Responsive image delivery across marketing page sections, service cards, and city photo sections. AVIF/WebP enabled.
- Lower-page photo-flow and recent-work images no longer compete at high priority. The later carousel has a deterministic initial image and loads only its active slide.
- One-day browser cache plus stale-while-revalidate for image/brand sources. Replacements used by optimized marketing images receive new content-version URLs. Unversioned legacy sources may retain the prior version for the cache period.
- Header size measurement and responsive fallback spacing separate the first-screen copy from fixed navigation.
- Descriptive homepage heading and proof line using existing published business facts.
- Reviews component on homepage and reviews page accepts real attributed Yelp data; otherwise provides direct Google/Yelp links. Actual quotations are pending accessible review data.
- Skip-to-main link, darker accent, footer Yelp contrast, booking accessible names beginning with the visible day, and navigable product sub-items.
- Locality-only PostalAddress. No private street address or fabricated storefront/coordinates. Preserve established schema IDs and existing verified directory profile normalization.
- Schema reservation action points directly to `/book-consultation/`.
- Meta page views queue immediately but load their browser script after load/idle; contacts and conversions expedite loading with existing deduplication IDs preserved. Google loaders retained: the published GTM container contains Ads configuration but no visible GA4 measurement ID.
- Rewrite verbose editorial descriptions and booking metadata. Omit unsupported shared sitemap modification dates; retain known editorial/answer-page dates.
- Canonical-host page redirects combine www and trailing slash normalization, excluding assets/API paths.
- SAMEORIGIN frame protection on core public marketing pages. Permissions policy disables browsing topics. Restrictive object/base/frame policy is report-only; it does not block production dependencies.

## Remaining decisions / evidence

1. Actual Yelp review excerpts, reviewer names, and source URLs. Provider configuration is not changed; no secrets requested in chat.
2. Genuine city-specific installations, photos, and review attribution. Existing assets are not falsely assigned to individual cities. No fabricated local projects.
3. Current search/lead evidence and a concrete redirect map before new city-page consolidation. September records already implemented ten consolidations and explicitly held two city shade pages; preserve those decisions. No additional noindex or page mergers in this change.
4. A coordinated end-to-end test booking and Google/Meta event-manager verification. Automated tests cover booking recovery and conversion deduplication, but no real appointment has been submitted.
5. HSTS includeSubDomains requires confirming HTTPS coverage for every affected subdomain. Do not enable it speculatively.
6. Short pages are not automatically defective. `/official/` is a focused identity-verification utility. Expand project/city stories when genuine evidence is available rather than padding to a word-count target.
7. Real-user performance results require traffic after release. Lab output is not a substitute for CrUX/field metrics.

## Rollback

Revert the audit implementation commit and redeploy the previously approved version. No migrations, stored business data, booking records, or page deletions are involved.

## Validation evidence

- Preview deployment for source commit `23d37a9`: `https://805-nsn5uqitj-805-shutters.vercel.app` (Vercel READY). Access remains protected; no public sharing grant was created.
- 44 focused regression tests pass across editorial image delivery, Meta queue/loading/deduplication, booking recovery, structured data, and sitemap generation. The historical quote evidence test also passes after fetching its pinned historical commit.
- Browser layout checks at 390/1280/1440 pixels: no header overlap, no horizontal overflow, no page exceptions, and keyboard skip-link focus succeeds.
- Shutters/gallery/reviews/booking routes return 200 locally. Checked image counts: 29/58/3/3; all have dimensions and no broken loaded image sources.
- Hero source: 230,105 bytes. Optimized AVIF: 29,677 bytes for the tall mobile crop and 37,858 bytes at desktop sizing. These asset sizes are not field-performance measurements.
- Local redirect requests with apex Host: both `/shutters` and `/shutters/` return a single permanent 308 to `https://www.805shutters.com/shutters/`; `/shutters/camarillo/` preserves its slash. Asset URLs retain their file extension path.
- Full repository suite and final local build are still running. Some database tests timed out under concurrent build/typecheck load; rerun them with isolated resources before claiming a clean full suite.
