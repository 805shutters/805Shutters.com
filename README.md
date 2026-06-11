# 805 Shutters website rebuild workspace

This repo is a working area for rebuilding and improving 805shutters.com search
visibility, conversion tracking, and paid social readiness.

This checkout is the source for the new Next.js App Router site deployed on
Vercel. Use `https://805-one.vercel.app` to verify the new site. The old
`https://www.805shutters.com/` WordPress site may still exist separately, but it
is not the deployment target for normal code changes in this repo.

## Rebuild workflow

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run deploy:vercel
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

Production deploys for this repo go to the Vercel project `805`. The stable
verification URL is `https://805-one.vercel.app`.

## Deploy to Vercel

The deploy command validates the app, pushes `main`, waits for the GitHub-backed
Vercel production build for the current commit, and verifies the public Vercel
URL.

```bash
npm run deploy:vercel
```

It intentionally deploys from GitHub/Vercel instead of uploading the local
working tree, so untracked local files are not accidentally published.

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
- `docs/meta-ads-manager-build-steps.md` - click-by-click Meta Ads Manager
  launch guide.
- `content/wordpress/` - WordPress-ready copy, H1s, and metadata updates.
- `content/ads/` - Meta/Facebook/Instagram ad copy and campaign setup.
- `scripts/audit_site.py` - dependency-free crawler/auditor for the live site.
- `scripts/generate_migration_inventory.py` - converts audit output into
  migration CSVs.
- `scripts/generate_meta_creatives.mjs` - generates starter Meta ad creative
  exports into `public/ads/`.
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

## Generate starter Meta ad creatives

```bash
node scripts/generate_meta_creatives.mjs
```

Outputs are written to `public/ads/` in 4:5, 1:1, and 9:16 ratios.

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
