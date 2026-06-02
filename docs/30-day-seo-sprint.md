# 30-day SEO and ads sprint

Date: 2026-06-01

## Week 1 - Fix the money leaks

1. Homepage:
   - Change the H1 to `Custom Shutters, Shades & Blinds in Ventura County`.
   - Replace the three `learn more` links with descriptive service anchors.
   - Add the homepage SEO intro and service-links section.
   - Add alt text to homepage service images.
2. Tracking:
   - Confirm the active Meta Pixel. Keep `549342503537516` if PixelYourSite is the source of truth.
   - Remove or document old inline pixel `117872572252906`.
   - Confirm whether both GA4 IDs are needed.
   - Track phone clicks as `Contact`.
   - Track successful form submissions and `/thank-you/` visits as `Lead`.
3. Publish the paid-social landing page:
   - Slug: `/free-window-treatment-consultation/`
   - Form shortcode: `[forminator_form id="1607"]`
   - Redirect the form to `/thank-you/` if Forminator supports it.

## Week 2 - Strengthen service pages

1. Add missing H1s to parent service pages.
2. Expand these thin pages to at least 350-600 useful words:
   - `/shutters/`
   - `/shades/`
   - `/blinds/`
   - `/window-treatments/`
   - `/window-coverings/`
3. Add internal links from each parent page to the strongest city pages.
4. Add 3 FAQs to each parent page.

## Week 3 - Local ranking buildout

1. Improve top city pages:
   - Camarillo shutters.
   - Thousand Oaks shutters.
   - Ventura shutters.
   - Oxnard shutters.
   - Camarillo shades.
   - Camarillo blinds.
2. Add photos from recent jobs where possible.
3. Add local alt text to each image.
4. Add links to `/recent-projects/`, `/reviews/`, and `/contact/`.

## Week 4 - Paid-social launch and retargeting

1. Launch a lead campaign to the consultation page.
2. Ad sets:
   - Ventura County broad homeowners.
   - Camarillo / Thousand Oaks / Ventura / Oxnard.
   - 30-day website retargeting.
3. Creative:
   - Installed shutters.
   - Installed shades.
   - Before/after or project proof.
   - Commercial roller shade install.
4. UTM template:
   - `utm_source=facebook`
   - `utm_medium=paid_social`
   - `utm_campaign={{campaign.name}}`
   - `utm_content={{ad.name}}`
   - `utm_term={{adset.name}}`
5. Measure:
   - Cost per landing-page view.
   - Cost per phone click.
   - Cost per lead.
   - Lead quality by city and product type.

## Definition of done

- Homepage has one service/location H1.
- Parent service pages each have one H1.
- Paid landing page is live and form-tested.
- Meta Pixel and GA4 events are clean and not double-counting.
- Search Console and Analytics show clean crawl/indexing and lead attribution.
