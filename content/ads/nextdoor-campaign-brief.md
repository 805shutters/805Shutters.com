# Nextdoor local campaign brief

Date: 2026-06-20
Live setup update: 2026-06-27

## Campaign recommendation

Start with one website-lead campaign on Nextdoor instead of a lead form. The
805 Shutters consultation page already captures UTM values, sends leads through
`/api/leads/`, tracks phone clicks, and redirects form submissions to
`/thank-you/`. The booking path now also preserves the same Nextdoor campaign
source when a visitor clicks from the consultation landing page into
`/book-consultation/`.

- Campaign name: `805_VC_Nextdoor_FreeConsultation_Jun2026`
- Objective: Increase Website Visits in the current Nextdoor Ads Manager flow
- Main destination: `/free-window-treatment-consultation/`
- Direct-booking test destination: `/book-consultation/`
- CTA: Get quote
- Live staged budget: $10 per day, shown by Nextdoor as a $300 monthly charge
  due upfront upon ad approval
- Test duration: Nextdoor's current flow is monthly and auto-renewing until
  canceled; set a day-27 reminder to pause, renew, or adjust before renewal
- Publish status: staged on the Nextdoor review screen, not published
- Location: selected city/region targeting across Ventura County and nearby
  Conejo Valley communities
- Schedule: 7 AM to 8 PM Pacific if dayparting is available
- Primary KPI: booked consultations from Nextdoor traffic
- Secondary KPIs: qualified calls, form leads, cost per booked or qualified lead

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

- Business name: 805 Shutters, Shades & Blinds if Nextdoor allows the change
- Phone: 805-806-9344
- Email: 805@805shutters.com
- Website: `https://www.805shutters.com/`
- Service area: Ventura County
- Categories: Window treatment store, shutters, blinds, shades, home improvement
- Logo uploaded and cropped cleanly
- At least 5 installed-project photos added
- Page story includes local ownership, 30+ years, 4.8-star Yelp rating, free
  in-home consultations, and Ventura County service-area language
- Collect 3-5 customer recommendations before paying if possible; do not delay
  launch indefinitely if the ad needs to start, but mark the missing
  recommendations as the main profile weakness
- Do not check the website-photo advertising permission box unless the owner is
  comfortable confirming the legal-rights statement shown by Nextdoor

## Targeting

Recommended launch structure:

- Ad group: `VC_30mi_FreeConsultation`
- Geography: broad Ventura County coverage from the business location
- Core cities to monitor in lead notes: Camarillo, Thousand Oaks, Ventura,
  Oxnard, Simi Valley, Moorpark, Ojai, Santa Rosa Valley, Port Hueneme,
  Santa Paula, Oak Park, Fillmore
- Exclude nothing at launch unless Nextdoor exposes an obvious irrelevant
  geography control

Live staged Nextdoor city/region selections:

- Piru, Ventura, Malibu, Santa Paula, Simi Valley, Fillmore, Thousand Oaks,
  Moorpark, Camarillo, Somis, Agoura Hills, Westlake Village, Oak Park, Bell
  Canyon, Lake Sherwood, and Santa Rosa Valley
- Automatic targeting is selected within those locations.
- Review-screen forecast: 59K-320K reach and 1.7M-4.9M impressions.

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

Build the residential campaign with five active ads:

1. Free consultation
2. Book a consultation
3. Core cities
4. Plantation shutters
5. Shades and blinds

Keep the commercial ad drafted but paused until the residential pilot is
delivering clean lead quality. If commercial is launched, use a separate
campaign and send traffic to `/commercial-window-coverings/`.

## Launch copy hierarchy

Use local proof before generic product language:

1. Ventura County / city-neighbor framing.
2. Free in-home consultation.
3. Family-owned local team with 30+ years of experience.
4. 4.8-star Yelp-rated trust signal.
5. Product fit: shutters, shades, blinds, drapery, exterior shades, and
   commercial coverings.

Recommended primary ad copy:

- Headline: `Free In-Home Window Consultation`
- Body: `Ventura County neighbors: compare shutters, shades, and blinds with a local 4.8-star Yelp-rated team with 30+ years. Free in-home consultation.`
- CTA: `Get quote`
- Destination: `https://www.805shutters.com/free-window-treatment-consultation/?utm_source=nextdoor&utm_medium=paid_social&utm_campaign=vc_nextdoor_consultations&utm_content=freeconsultation_newsfeed_01&utm_term=ventura_county_neighbors`

## Record tracking

Nextdoor attribution should land in both lead-form records and self-booking
records:

- Form submissions store `utm_source=nextdoor` and the other campaign fields on
  the `leads` row through `/api/leads/`.
- Self-booked appointments store the same UTM fields on the `leads` row, copy
  campaign metadata into the CRM job and calendar event, and add a visible
  `Lead source: Nextdoor` line to the lead/job notes.
- Customer-file snapshots and self-booking product records copy the booking page
  path and campaign attribution into their metadata, so later record review does
  not depend only on the original lead row.
- If a visitor lands on the consultation page with Nextdoor UTMs and then clicks
  into `/book-consultation/`, same-tab campaign storage keeps the source attached
  to the booking submission.

## Launch checklist

- Confirm the Nextdoor Business Page is claimed.
- Confirm no stale Flint, MI, old Gmail, or non-HTTPS website values remain on
  the profile.
- Confirm photos tab shows installed-project photos.
- Confirm the profile has at least one customer recommendation or the owner has
  approved launching without recommendations.
- Confirm the landing page loads:
  `https://www.805shutters.com/free-window-treatment-consultation/`
- Confirm the privacy policy loads:
  `https://www.805shutters.com/privacy-policy/`
- Use the UTM URLs in `content/ads/nextdoor-campaign-setup.csv`.
- Preview every ad on mobile before publishing.
- Submit one test lead from the Nextdoor UTM URL if possible.
- Confirm the lead record contains `utm_source=nextdoor`.
- Submit one test booking from a Nextdoor UTM URL and confirm the booked lead,
  CRM job, and customer-file metadata all include the Nextdoor campaign source.
- Ask phone leads how they found 805 Shutters and mark Nextdoor in the CRM notes.
- Set a calendar reminder for day 13 to pause, renew, or change budget before
  the monthly billing cycle continues.
- For the live staged setup, use a day-27 reminder because Nextdoor shows a
  monthly renewal.

## Optimization rules

- Review daily for the first 3 days.
- Pause any ad after $75 spend with no calls, forms, or useful site engagement.
- Keep the top 1-2 ads live through the full 14-day test if lead quality is
  acceptable.
- Scale from $10/day only after at least 3 qualified leads or 1 booked
  consultation is clearly attributed to Nextdoor.
- Do not judge the campaign by clicks alone. The decision metric is booked or
  qualified consultations.
