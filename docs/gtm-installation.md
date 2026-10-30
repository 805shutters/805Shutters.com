# EvenDigit GTM installation

Approved by Mike on 2026-10-30. Container: **GTM-MLVF9PP3**, supplied in Rishabh Tomar's October 27 installation attachment in the 805 mailbox (message `1a17e6d988f6a10b`). The agency's October 29 clarification requires preserving existing tracking and avoiding duplicate conversions.

## Behavior

- Shared head bootstrap and body `noscript` iframe cover public marketing, service, geographic, contact, booking and confirmation pages, including future public pages.
- `isMarketingTrackingPath` excludes CRM, quote/signing/catalog/preview routes, autopay, installer forms, staff booking tools, APIs and assets. It deliberately does not change the older analytics coverage policy.
- Next.js proxy returns a non-RSC, non-cacheable response for client navigation or prefetch across that boundary. Next performs a fresh document navigation, discarding the loaded container before entering private workflows. Public-to-public and private-to-private navigation remains unchanged. Only GET navigation is affected, not submissions/server actions.
- `skipProxyUrlNormalize` is required: otherwise Next strips the RSC headers before proxy code runs. Browser testing caught this before release. See [Next.js proxy documentation](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
- The bootstrap preserves `dataLayer` and initializes once. Existing GA/Ads/Meta handlers are unchanged; this release adds no conversion events, consent policy, account permissions or agency tag configuration.

Placement follows [Google's installation instructions](https://support.google.com/tagmanager/answer/14847097). The iframe is the first authored body content; Next may insert its own hidden rendering scaffold before it.

## Verification checklist

- Focused coverage, server-rendered snippets, initialization deduplication, proxy/prefetch boundary and existing public-activity tests.
- Typecheck, full unit suite, production build, contract attachment browser regression, sitemap/internal-link/redirect checks.
- Browser: correct downloaded container, one instance across public links/back/refresh; no container on private documents; full-document public/private links and router pushes; no-JavaScript iframe; mobile/desktop appearance.
- Read-only sitemap/private-sample audit: `python3 scripts/verify_gtm_installation.py --base-url https://www.805shutters.com`.
- Re-fetch the published container before release to detect unexpected new tags. The inspected version 1 had no tags or rules.

## Release boundary

Commit/push only this installation to main and run `npm run deploy:vercel` for project 805. Verify the production domain, not only a Ready deployment. Local detailed evidence and release status remain in the task's active handoff. Container installation does not certify the agency's later conversion setup. No external message or permission invitation is sent by this release.
