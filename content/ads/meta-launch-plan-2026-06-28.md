# Meta paid launch plan

Date: 2026-06-28

## Current account state

- Chrome is logged into Meta Ads Manager.
- Business ID: `1695855623965388`.
- Ad account: `805 Shutters` / `214971293739128`.
- Ads Manager has an existing campaign row with `Payment error`.
- Billing shows:
  - No payment methods on the ad account.
  - Ad account disabled due to failed payment.
  - Current balance: `$25.16`, payment past due.
- Events Manager for this business opens to the initial `Connect data` state.
- The live site loads Meta Pixel `549342503537516`, but this logged-in business/account cannot manage that dataset. Opening the pixel directly returns a permissions error.
- `https://www.805shutters.com/free-window-treatment-consultation/` is live.
- `https://www.805shutters.com/privacy-policy/` is live and usable for instant forms.

## Launch decision

Do not publish spend yet.

The campaign can be built as drafts only after the billing issue is fixed and the pixel/dataset path is resolved. Website-lead optimization should not run until Events Manager can receive and verify `PageView`, `Contact`, and `Lead` events for the same dataset attached to the ad account.

## Required pre-launch fixes

1. Pay the past-due Meta balance and add a valid payment method.
2. Resolve the pixel mismatch by choosing one path:
   - Request/manage access to pixel `549342503537516`, then connect it to the ad account.
   - Or create a new dataset/pixel under the current business, update Vercel env vars, and deploy/verify it.
3. Verify the website event flow:
   - `PageView` on the lead landing page.
   - `Contact` on phone clicks.
   - `Lead` after a successful test form submission.
4. If server-side CAPI is enabled, verify browser/server deduplication with the same event ID.
5. Confirm instant-form lead delivery destination before launch so Meta form leads are followed up fast.

## Campaign architecture

### Campaign A - Website leads

- Name: `805_VC_WebsiteLeads_2026Q3`.
- Objective: Leads.
- Conversion location: Website.
- Performance goal: maximize leads.
- Optimization event: `Lead`.
- Launch budget: `$50/day` during validation, then `$75/day`.
- URL: `https://www.805shutters.com/free-window-treatment-consultation/`.
- Ad sets:
  - `VC_Broad_AdvantagePlus`.
  - `CoreCities_AdvantagePlus`.
  - `HomeImprovement_Suggestions`.

### Campaign B - Instant forms

- Name: `805_VC_InstantForms_2026Q3`.
- Objective: Leads.
- Conversion location: Instant forms.
- Form type: Higher intent.
- Launch budget: `$35/day` during validation, then `$50/day`.
- Privacy policy URL: `https://www.805shutters.com/privacy-policy/`.
- Use the questions in `content/ads/instant-form-blueprint.md`.

### Campaign C - Retargeting

- Name: `805_VC_Retargeting_2026Q3`.
- Objective: Leads.
- Launch budget: `$15/day` during validation, then `$25/day`.
- Audiences:
  - Website visitors 30 days after pixel access is fixed.
  - Facebook/Instagram engagers 365 days.
- Exclude recent leads when the audience is available.

### Campaign D - Commercial

- Name: `805_Commercial_WindowCoverings_2026Q3`.
- Objective: Leads.
- Launch after residential tracking is verified.
- Budget: `$25/day`.
- URL: `https://www.805shutters.com/commercial-window-coverings/`.

## Budget schedule

- Validation: `$100/day` total.
  - Website leads: `$50/day`.
  - Instant forms: `$35/day`.
  - Retargeting: `$15/day`.
  - Commercial: off.
- Heavy launch: `$175/day` total after clean tracking and lead quality.
  - Website leads: `$75/day`.
  - Instant forms: `$50/day`.
  - Retargeting: `$25/day`.
  - Commercial: `$25/day`.
- Scale: `$250/day` only after at least one campaign produces three or more qualified leads.

## Creative and copy

Use the existing assets:

- Creative map: `content/ads/generated-creative-map.csv`.
- Ad copy: `content/ads/ad-variants.csv`.
- Static assets: `public/ads/`.

Launch priorities:

1. Free consultation broad prospecting.
2. Light/privacy room transformation.
3. Plantation shutters.
4. Window shades.
5. Custom blinds.
6. Review/project proof retargeting.
7. Commercial window coverings after the residential validation pass.

## First 72-hour operating rules

- Check spend, delivery, landing page views, phone clicks, form leads, and comments daily.
- Do not judge ad sets before meaningful delivery unless tracking is broken.
- Pause broken creative, wrong crops, irrelevant comments, or ad sets with 50 landing page views and zero leads/phone clicks.
- Track real quality in `content/ads/optimization-dashboard.csv`, not only Meta-reported leads.
- Pause any source that produces unreachable phone numbers.

## Ready-to-build sequence

1. Fix billing.
2. Fix dataset/pixel access.
3. Verify events.
4. Build Campaign A and Campaign B as drafts.
5. Build retargeting after website audiences are available.
6. Publish only after final budget and payment confirmation.
