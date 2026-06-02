# 805 Shutters SEO action plan

Date: 2026-05-30

## Current baseline

- Platform: WordPress, Colibri theme/page builder, Rank Math SEO, WP Rocket,
  CleanTalk, Forminator, PixelYourSite, Google Analytics, Google Ads, and Meta
  Pixel.
- Homepage title and meta description are present.
- Rank Math JSON-LD is present for the business, place, website, and page.
- Robots and sitemap are present. `robots.txt` points to
  `https://www.805shutters.com/sitemap_index.xml`.
- Homepage Lighthouse baseline:
  - Mobile: Performance 66, Accessibility 83, Best Practices 58, SEO 92.
  - Desktop: Performance 81, Accessibility 84, Best Practices 58, SEO 92.
- Homepage mobile performance bottlenecks:
  - Largest Contentful Paint: 6.0 s.
  - First Contentful Paint: 2.5 s.
  - Total Blocking Time: 300 ms.
  - Time to Interactive: 10.3 s.
  - Estimated unused JavaScript: about 748 KiB.
  - Estimated image-delivery savings: about 304 KiB.
- Tracking exists:
  - Meta Pixel via PixelYourSite: `549342503537516`.
  - Older inline Facebook Pixel snippet also initializes `117872572252906`.
  - Google Analytics tags include `G-4L4QDRNG4B` and `G-CJEBNQJY81`.
  - Google Ads tag includes `AW-1009321066`.

## Priority 1 - Conversion tracking cleanup

1. Choose the primary Meta Pixel and remove duplicate/legacy pixel firing if it
   is not intentionally used.
2. Choose the primary GA4 property and remove duplicate GA4 pageview firing if
   one property is historical.
3. Confirm Google Ads conversion actions:
   - Phone click.
   - Contact form submit.
   - Thank-you page load.
   - Direction/map click if used.
4. In PixelYourSite, fire a Lead event for successful contact forms and a
   Contact event for phone clicks. Keep PageView and ViewContent, but avoid
   duplicate lead events.
5. Add UTM naming rules for paid traffic:
   - `utm_source=facebook`
   - `utm_medium=paid_social`
   - `utm_campaign={{campaign.name}}`
   - `utm_content={{ad.name}}`
   - `utm_term={{adset.name}}`

## Priority 2 - Homepage and service landing-page improvements

1. Replace vague homepage links that say "learn more" with descriptive anchor
   text:
   - "Explore custom shutters"
   - "Explore window shades"
   - "Explore custom blinds"
2. Refresh the homepage hero image or optimize the current LCP image. The live
   audit points at oversized homepage imagery and old product images as the
   main image-delivery opportunity.
3. Add stronger above-the-fold conversion copy:
   - Free in-home consultation.
   - Family-owned Ventura County window treatment company.
   - Custom shutters, shades, blinds, and commercial coverings.
   - Phone number and quote/contact CTA.
4. Add internal links from the homepage to the highest-value city/service
   pages:
   - Camarillo shutters.
   - Thousand Oaks shutters.
   - Ventura shutters.
   - Oxnard shutters.
   - Camarillo shades.
   - Ventura County blinds.
5. Add a short "recent local installs" section that links to recent project
   pages using city/service keywords.

## Priority 3 - Crawl quality and content pruning

1. Review old attachment-style post URLs such as `/shutters-eclipse6/`,
   `/blinds-wood4/`, and numbered blank-title URLs.
2. They currently return 200 and are noindexed, which avoids index pollution,
   but they still create crawlable public URLs. Best options:
   - Redirect useful image posts to the relevant gallery or service page.
   - Delete unused blank posts.
   - Keep noindex only if the page must stay public.
3. Confirm post sitemap remains disabled if these posts are only media stubs.
4. Keep the page sitemap focused on real service, city, gallery, reviews,
   contact, FAQ, and project pages.

## Priority 4 - City and service page growth

The site already has broad page coverage for shutters, shades, blinds, window
treatments, and window coverings by city. The next gain is quality and
differentiation, not simply more pages.

Recommended update pattern for each high-value city/service page:

1. First paragraph: service plus city, written naturally.
2. Proof: local installs, years in business, reviews, family-owned positioning.
3. Product fit: shutters, shades, blinds, motorization, commercial options.
4. Local relevance: neighborhood/city names only where accurate.
5. CTA: free consultation and phone/contact form.
6. FAQ block: 3-5 specific questions.
7. Internal links: parent service page, related city page, gallery/project page,
   reviews, contact.

Initial page targets:

- `/shutters/camarillo/`
- `/shutters/thousand-oaks/`
- `/shutters/ventura/`
- `/shutters/oxnard/`
- `/shades/camarillo-ca/`
- `/blinds/ventura-county/`
- `/commercial-window-coverings/`
- `/commercial-roller-shades/`

## Priority 5 - Technical cleanup

1. Reduce duplicate tracking scripts after confirming the active properties.
2. Defer or conditionally load Forminator assets on pages without forms.
3. Audit Colibri/Fancybox/Swiper usage on the homepage and unload where unused.
4. Serve optimized WebP/AVIF variants for large homepage and product images.
5. Fix accessibility items reported by Lighthouse:
   - Low contrast text.
   - Heading order.
   - Missing main landmark.
   - Links without accessible names.
6. Update old `http://805shutters.com/...` image references in sitemap/content
   to `https://www.805shutters.com/...` where they are still embedded.

## WordPress access needed for live edits

To apply these directly, I need one of:

- WordPress admin access.
- WordPress application password for a user with page-edit permission.
- Theme/plugin/database export checked into this repo.
- Hosting/SFTP access plus confirmation of the active theme/plugin workflow.
