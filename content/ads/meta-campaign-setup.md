# Meta campaign setup

Date: 2026-06-01

This is the quick setup view. The detailed heavy-launch plan is in
`docs/facebook-heavy-launch-plan.md`.

## Launch campaigns

1. `805_VC_WebsiteLeads_Jun2026`
   - Objective: Leads.
   - Conversion location: Website.
   - Optimization event: Lead.
   - Landing page: `/free-window-treatment-consultation/`.
   - Initial daily budget: $75.
2. `805_VC_InstantForms_Jun2026`
   - Objective: Leads.
   - Conversion location: Instant forms.
   - Form type: Higher intent.
   - Initial daily budget: $50.
3. `805_VC_Retargeting_Jun2026`
   - Objective: Leads.
   - Audiences: website visitors and social engagers.
   - Initial daily budget: $25.
4. `805_Commercial_WindowCoverings_Jun2026`
   - Objective: Leads.
   - Landing page: `/commercial-window-coverings/`.
   - Initial daily budget: $25 after residential tracking is confirmed.

## Ad sets

- Build from `content/ads/heavy-launch-campaigns.csv`.
- Use Advantage+ audience and placements where available.
- Keep location as the hard control.
- Exclude recent leads from retargeting when available.

## Creative assets

- Bright installed shutter photo.
- Roller shade photo on a large window.
- Blind installation photo.
- Commercial roller shade or office photo.
- Simple before/after if available.

Build creative from `content/ads/creative-production-brief.md`.

## Ads

- Build initial ads from `content/ads/ad-variants.csv`.
- Keep at least 12 ads live across website leads, instant forms, retargeting,
  and commercial.
- Use three aspect ratios where possible: 4:5, 1:1, and 9:16.

## Reporting

Track daily in `content/ads/optimization-dashboard.csv`:

- Spend.
- Impressions.
- Clicks.
- Landing page views.
- Leads.
- Phone clicks.
- Qualified leads.
- Booked consultations.
- Notes and next action.
