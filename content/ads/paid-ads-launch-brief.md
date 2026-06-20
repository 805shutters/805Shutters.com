# Paid ads launch brief

Date: 2026-06-18

## Funnel now built

- Landing page: `/free-window-treatment-consultation/`
- Form endpoint: `/api/leads/`
- Thank-you redirect: `/thank-you/`
- Phone click tracking: `Contact`
- Website lead tracking: GA4 `generate_lead`, Meta Pixel `Lead`, optional Meta CAPI `Lead`
- UTM capture: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`

## First campaign stack

1. Google Search captures active buyers searching for shutters, shades, blinds, and window coverings.
2. Facebook/Instagram uses install photos and lead forms to create low-friction local demand.
3. Retargeting brings back visitors who clicked but did not call or submit the form.

## Budget

Start at $100/day for the first 3 days:

- $60/day Google Search
- $25/day Facebook/Instagram website leads
- $15/day Meta retargeting once audiences are available

After tracking is verified and leads are real, move toward:

- $90/day Google Search
- $40/day Facebook/Instagram website leads
- $25/day Meta instant forms
- $20/day retargeting

## Google Search build

Use `content/ads/google-search-campaigns.csv`.

Campaign settings:

- Campaign name: `805_VC_Search_Consultations`
- Objective: Leads
- Bidding: start Maximize Conversions after conversion tracking is confirmed; otherwise start Manual CPC with conservative caps.
- Location: Ventura County plus served nearby cities only.
- Ad schedule: 7 AM to 8 PM local time while same-day phone follow-up is possible.
- Final URL: `/free-window-treatment-consultation/` for residential; `/commercial-window-coverings/` for commercial.
- Assets: call asset `805-806-9344`, sitelinks for Shutters, Shades, Blinds, Commercial Window Coverings, Book Consultation.
- Negatives: import `content/ads/negative-keywords.txt`.

## Meta build

Use:

- `content/ads/meta-campaign-setup.md`
- `content/ads/ad-variants.csv`
- `content/ads/instant-form-blueprint.md`
- `public/ads/`

Initial Meta campaigns:

- `805_VC_WebsiteLeads_Jun2026`
- `805_VC_InstantForms_Jun2026`
- `805_VC_Retargeting_Jun2026`

Keep location as the hard control. Use Advantage+ placements, but review placement quality after the first 1,000 impressions.

## Do not scale until verified

- Landing page loads on mobile and desktop.
- Test form reaches Supabase or the lead webhook.
- Test form redirects to `/thank-you/`.
- Meta Events Manager receives one browser `Lead`.
- Meta CAPI receives one deduplicated `Lead` if enabled.
- GA4 realtime receives `generate_lead`.
- Google Ads receives the lead conversion action.
- Phone link fires `Contact` and Google phone conversion.

## Daily review fields

Track these in `content/ads/optimization-dashboard.csv`:

- Spend
- Calls
- Form leads
- Qualified leads
- Booked consultations
- City
- Product interest
- Source/campaign/content
- Notes from the follow-up call

Pause anything that produces form fills without reachable phone numbers.
