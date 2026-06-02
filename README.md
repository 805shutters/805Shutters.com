# 805 Shutters website rebuild workspace

This repo is a working area for rebuilding and improving 805shutters.com search
visibility, conversion tracking, and paid social readiness.

The live site is WordPress at https://www.805shutters.com/. This checkout does
not contain the WordPress theme, plugin, or database source. The current rebuild
target is a Next.js App Router site deployed on Vercel while WordPress remains
live until cutover.

## Rebuild workflow

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run migration:inventory
npm run supabase:start
npm run supabase:reset
```

- `src/app/` - Next.js App Router pages, API routes, sitemap, and robots.
- `src/components/` - shared site layout, service cards, tracking scripts, and
  consultation form UI.
- `src/lib/site-data.ts` - route/content map for the rebuilt site.
- `supabase/` - local Supabase config and lead-capture database migration.
- `migration/` - generated current URL inventory and redirect draft queue.
- `docs/vercel-rebuild-prep.md` - launch prep, env vars, and DNS cutover gates.
- `docs/account-bootstrap.md` - account setup for the standalone 805 GitHub,
  Supabase, and Vercel ownership.
- `docs/supabase-lead-capture.md` - lead-capture schema and API route notes.

Production deployment is not ready until lead delivery, analytics, ad
conversions, redirects, and DNS ownership have been verified.

## Current artifacts

- `package.json` - Next/Vercel rebuild scripts and dependencies.
- `docs/account-bootstrap.md` - setup steps for the standalone 805 GitHub,
  Supabase, and Vercel ownership.
- `docs/supabase-lead-capture.md` - Supabase lead table and API integration.
- `docs/seo-action-plan.md` - prioritized SEO and conversion work queue.
- `docs/wordpress-update-queue.md` - exact WordPress page edits and copy.
- `docs/local-seo-keyword-map.md` - target keyword and internal-link map.
- `docs/30-day-seo-sprint.md` - execution plan for the first month.
- `docs/tracking-cleanup.md` - Meta Pixel, GA4, Google Ads event cleanup.
- `docs/vercel-rebuild-prep.md` - migration checklist and launch gates.
- `docs/meta-social-ad-plan.md` - Facebook/Instagram advertising setup and
  campaign structure.
- `docs/facebook-heavy-launch-plan.md` - heavy Meta launch structure, budgets,
  gates, and optimization rules.
- `content/wordpress/` - WordPress-ready copy, H1s, and metadata updates.
- `content/ads/` - Meta/Facebook/Instagram ad copy and campaign setup.
- `scripts/audit_site.py` - dependency-free crawler/auditor for the live site.
- `scripts/generate_migration_inventory.py` - converts audit output into
  migration CSVs.
- `scripts/publish_wp_page.py` - authenticated WordPress REST helper for
  creating/updating a page from local HTML.
- `reports/lighthouse-home-mobile.json` - Lighthouse baseline for the homepage.
- `reports/lighthouse-home-desktop.json` - Lighthouse desktop baseline.

## Rerun the audit

```bash
python3 scripts/audit_site.py --base-url https://www.805shutters.com --output reports/site-audit.json --markdown reports/site-audit.md
```

## Regenerate migration inventory

```bash
npm run migration:inventory
```

## Rerun Lighthouse

```bash
npx --yes lighthouse https://www.805shutters.com/ \
  --output=json \
  --output-path=reports/lighthouse-home-mobile.json \
  --quiet \
  --chrome-flags="--headless=new --no-sandbox" \
  --only-categories=performance,seo,accessibility,best-practices \
  --form-factor=mobile \
  --screenEmulation.mobile=true \
  --screenEmulation.width=390 \
  --screenEmulation.height=844 \
  --screenEmulation.deviceScaleFactor=3 \
  --throttling-method=simulate
```

## Publish the paid-social landing page as a WordPress draft

Requires a WordPress application password for a user with page-edit permission.

```bash
WP_USER='your-user' \
WP_APP_PASSWORD='xxxx xxxx xxxx xxxx xxxx xxxx' \
python3 scripts/publish_wp_page.py \
  --slug free-window-treatment-consultation \
  --title 'Free Window Treatment Consultation in Ventura County' \
  --content-file content/wordpress/free-window-treatment-consultation.html \
  --status draft
```
