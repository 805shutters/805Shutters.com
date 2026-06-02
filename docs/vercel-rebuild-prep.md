# 805 Shutters Vercel rebuild prep

Date: 2026-06-02

## Objective

Rebuild `805shutters.com` as a Vercel-deployed Next.js site while the current
WordPress site stays live until launch readiness is proven.

## Current state

- Live production site: `https://www.805shutters.com/`
- Current platform: WordPress with Rank Math, WP Rocket, PixelYourSite, GA4,
  Google Ads, and Meta Pixel.
- Rebuild target: Next.js App Router on Vercel.
- Local app scaffold: repo root.
- Current WordPress source remains the live site, sitemap, REST API, and local
  audit files.

## Access needed

Do not put raw credentials in git, chat, or Codex memory.

- WordPress admin access for page/media export and content verification.
- Domain registrar access for DNS cutover.
- Vercel account or team access.
- GitHub repository access for Git-based deployments.
- Google Search Console, GA4, Google Ads, and Meta Business access.
- Lead destination access for form submissions.

## Environment variables

Set these in Vercel Project Settings before production launch:

```text
NEXT_PUBLIC_SITE_URL=https://www.805shutters.com
NEXT_PUBLIC_GA4_ID=
NEXT_PUBLIC_GOOGLE_ADS_ID=
NEXT_PUBLIC_META_PIXEL_ID=
LEAD_WEBHOOK_URL=
```

`LEAD_WEBHOOK_URL` must point to the approved lead delivery workflow before
the new contact or consultation form can replace WordPress Forminator.

## Build phases

1. Preserve URL structure from the live sitemap.
2. Rebuild page templates for services, city pages, projects, reviews, FAQ,
   gallery, contact, and the paid-social landing page.
3. Replace starter copy on project pages with real photos and installation
   details.
4. Configure one GA4 property, one Meta Pixel, and Google Ads conversions.
5. Configure lead delivery and test submissions end to end.
6. Deploy a Vercel preview and compare it against the live WordPress site.
7. Add `805shutters.com` and `www.805shutters.com` to Vercel.
8. Lower DNS TTL before cutover.
9. Switch DNS only after QA passes.
10. Keep WordPress available for rollback during the first launch window.

## Launch gates

- `npm run build` passes.
- `npm run typecheck` passes.
- `npm run migration:inventory` has no unexpected high-value URL gaps.
- Sitemap includes all final production pages.
- Every old indexed URL has either a rebuilt page or an approved redirect.
- Contact and consultation forms deliver to the correct owner.
- Phone click and lead events fire once in GA4, Meta, and Google Ads.
- Search Console property is verified after DNS cutover.
- Lighthouse checks show improved mobile performance over the WordPress
  baseline.

## Useful commands

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm run audit:site
npm run migration:inventory
```

## Cutover notes

The DNS cutover should be the final step, not the first step. The current
WordPress site should remain reachable until the Vercel preview is tested on
mobile and desktop, lead routing is confirmed, tracking is de-duplicated, and
redirect decisions are documented.
