# Facebook and Instagram advertising plan

Date: 2026-05-30

## Goal

Generate local consultation leads for shutters, shades, blinds, and commercial
window coverings in Ventura County.

## Tracking prerequisites

Before spend increases, confirm these events in Meta Events Manager and GA4:

- `PageView` on all pages.
- `ViewContent` on service/city/project pages.
- `Contact` on phone clicks.
- `Lead` on contact form success and thank-you page.

The site currently has PixelYourSite and a Meta Pixel, but the homepage source
also shows an older inline Facebook Pixel ID. Confirm whether both pixels are
intentional. If not, remove the old one to keep reporting clean.

## Audience structure

Start with three cold audiences:

1. Homeowners in Ventura County and nearby service areas.
2. Home improvement interest stack:
   - Interior design.
   - Home renovation.
   - Window treatments.
   - Plantation shutters.
   - Blinds and shades.
3. Lookalike audience from leads or website visitors once the pixel has enough
   event volume.

Retargeting audiences:

- 30-day website visitors.
- 90-day website visitors.
- People who visited service pages but did not submit a lead.
- Facebook/Instagram engagers.

## Campaign structure

### Campaign 1 - Lead generation

- Objective: Leads.
- Conversion location: Website.
- Optimization event: Lead.
- Landing page: dedicated consultation page or `/contact/`.
- Ad sets:
  - Ventura County broad.
  - Camarillo, Thousand Oaks, Ventura, Oxnard.
  - Retargeting 30-day site visitors.

### Campaign 2 - Project proof retargeting

- Objective: Leads or Sales depending on account setup.
- Landing page: `/recent-projects/` or a matching project page.
- Creative: before/after or installed-product photos.
- CTA: Book a free in-home consultation.

### Campaign 3 - Commercial coverings

- Objective: Leads.
- Landing page: `/commercial-window-coverings/` or
  `/commercial-roller-shades/`.
- Targeting: local business owners, facility managers, office interiors,
  property management, plus retargeting.

## Ad creative angles

1. Local trust:
   - Family-owned Ventura County window treatment company.
   - Over 30 years of local experience.
   - 5-star review positioning.
2. Product fit:
   - Custom shutters, shades, and blinds measured for your home.
   - Light control, privacy, insulation, and clean design.
3. Convenience:
   - Free in-home consultation.
   - Professional measuring and installation.
4. Commercial:
   - Roller shades and window coverings for offices, storefronts, and shared
     spaces.

## Sample ad copy

Primary text:

> Upgrade your windows with custom shutters, shades, or blinds installed by a
> local Ventura County team. 805 Shutters offers free in-home consultations,
> professional measuring, and expert installation.

Headline options:

- Custom Window Treatments
- Free In-Home Consultation
- Ventura County Shutters
- Shades, Blinds, and Shutters

Description options:

- Family-owned local installer.
- Built for privacy, light control, and style.
- Serving Camarillo, Thousand Oaks, Ventura, Oxnard, and nearby cities.

## Landing page recommendations

Each paid-social landing page should include:

- One clear H1 matching the ad promise.
- Phone CTA near the top.
- Contact form above the fold on desktop or immediately after proof on mobile.
- 3-5 local proof points.
- Recent install photos.
- Reviews/testimonials.
- FAQ section.
- Thank-you page redirect after form submit.

## Measurement checklist

- Meta Pixel helper shows one intended pixel.
- Events Manager receives PageView, ViewContent, Contact, and Lead.
- GA4 Realtime shows paid-social visits with UTM values.
- Google Ads conversion actions are not double-counting Meta traffic.
- Form submissions redirect to `/thank-you/`.
- Phone links include event tracking.
