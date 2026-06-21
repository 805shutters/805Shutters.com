# Nextdoor local campaign brief

Date: 2026-06-20

## Campaign recommendation

Start with one website-lead campaign on Nextdoor instead of a lead form. The
805 Shutters consultation page already captures UTM values, sends leads through
`/api/leads/`, tracks phone clicks, and redirects form submissions to
`/thank-you/`.

- Campaign name: `805_VC_Nextdoor_FreeConsultation_Jun2026`
- Objective: Leads if available in Ads Manager; otherwise Increase Website Visits
- Destination: `/free-window-treatment-consultation/`
- CTA: Contact Us or Request Consultation
- Daily budget: $25 per day
- Test duration: 14 days
- Pilot spend: $350
- Location: Ventura County service area, starting with a broad radius from the
  business location in Camarillo if Nextdoor requires radius targeting
- Schedule: 7 AM to 8 PM Pacific if dayparting is available
- Primary KPI: booked consultations from Nextdoor traffic
- Secondary KPIs: qualified calls, form leads, cost per qualified lead

## Why this campaign

Nextdoor is strongest when the ad feels local and practical. Lead with free
consultations, real installed-project photos, and city-specific copy. Avoid
heavy text overlays and generic brand graphics.

Official Nextdoor specs and guidance used for this setup:

- Ads Manager creative specs:
  `https://business.nextdoor.com/en-us/nam/nextdoor-ads-manager/creative-specs`
- Getting started with Ads Manager:
  `https://business.nextdoor.com/en-us/nam/getting-started`
- Business page setup:
  `https://business.nextdoor.com/en-us/getting-started/business-page`

## Business page setup before launch

Confirm these fields on the Nextdoor Business Page before spending:

- Business name: 805 Shutters
- Phone: 805-806-9344
- Email: 805@805shutters.com
- Website: `https://www.805shutters.com/`
- Service area: Ventura County
- Categories: Window treatment store, shutters, blinds, shades, home improvement
- Logo uploaded and cropped cleanly
- At least 5 installed-project photos added
- Ask the customer who found the business on Nextdoor to recommend or fave the
  page if they are willing

## Targeting

Recommended launch structure:

- Ad group: `VC_30mi_FreeConsultation`
- Geography: broad Ventura County coverage from the business location
- Core cities to monitor in lead notes: Camarillo, Thousand Oaks, Ventura,
  Oxnard, Simi Valley, Moorpark, Ojai, Santa Rosa Valley, Port Hueneme,
  Santa Paula, Oak Park, Fillmore
- Exclude nothing at launch unless Nextdoor exposes an obvious irrelevant
  geography control

Do not split too many product-specific ad groups at launch. Use the creative
variants to learn whether shutters, shades, blinds, or general consultation copy
gets the cleanest leads.

## Creative assets

Upload-ready Nextdoor image assets:

- `public/ads/nextdoor/805-nextdoor-free-consultation-1200.jpg`
- `public/ads/nextdoor/805-nextdoor-shutters-1200.jpg`
- `public/ads/nextdoor/805-nextdoor-shades-1200.jpg`
- `public/ads/nextdoor/805-nextdoor-blinds-1200.jpg`
- `public/ads/nextdoor/805-nextdoor-commercial-1200.jpg`

These are 1200 x 1200 JPGs generated from real project/product imagery with no
text overlay.

## Ad rotation

Build the residential campaign with four active ads:

1. Free consultation
2. Core cities
3. Plantation shutters
4. Shades and blinds

Keep the commercial ad drafted but paused until the residential pilot is
delivering clean lead quality. If commercial is launched, use a separate
campaign and send traffic to `/commercial-window-coverings/`.

## Launch checklist

- Confirm the Nextdoor Business Page is claimed.
- Confirm the landing page loads:
  `https://www.805shutters.com/free-window-treatment-consultation/`
- Confirm the privacy policy loads:
  `https://www.805shutters.com/privacy-policy/`
- Use the UTM URLs in `content/ads/nextdoor-campaign-setup.csv`.
- Preview every ad on mobile before publishing.
- Submit one test lead from the Nextdoor UTM URL if possible.
- Confirm the lead record contains `utm_source=nextdoor`.
- Ask phone leads how they found 805 Shutters and mark Nextdoor in the CRM notes.

## Optimization rules

- Review daily for the first 3 days.
- Pause any ad after $75 spend with no calls, forms, or useful site engagement.
- Keep the top 1-2 ads live through the full 14-day test if lead quality is
  acceptable.
- Scale from $25/day to $40/day only after at least 3 qualified leads or 1 booked
  consultation is clearly attributed to Nextdoor.
- Do not judge the campaign by clicks alone. The decision metric is booked or
  qualified consultations.
