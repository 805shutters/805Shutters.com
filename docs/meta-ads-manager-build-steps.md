# Meta Ads Manager build steps

Date: 2026-06-02

Use this when building the launch manually in Meta Ads Manager.

## Before opening Ads Manager

1. Confirm `/free-window-treatment-consultation/` is live.
2. Confirm `/privacy-policy/` is live.
3. Confirm Pixel and Events Manager show:
   - PageView.
   - Contact.
   - Lead.
4. Download or locate creative assets from `public/ads/`.
5. Open `content/ads/heavy-launch-campaigns.csv`.
6. Open `content/ads/ad-variants.csv`.

## Campaign A - Website Leads

1. Create campaign.
2. Objective: Leads.
3. Name: `805_VC_WebsiteLeads_Jun2026`.
4. Conversion location: Website.
5. Performance goal: Maximize number of leads.
6. Conversion event: Lead.
7. Budget: start at $75/day.
8. Create ad sets:
   - `VC_Broad_AdvantagePlus`
   - `CoreCities_AdvantagePlus`
   - `HomeImprovement_Suggestions`
9. Location:
   - Ventura County service area and cities actually served.
10. Placements:
   - Advantage+ placements on.
11. Ads:
   - Use `content/ads/ad-variants.csv`.
   - Use creative from `content/ads/generated-creative-map.csv`.
12. Destination:
   - Use the UTM URL in the ad variant row.

## Campaign B - Instant Forms

1. Create campaign.
2. Objective: Leads.
3. Name: `805_VC_InstantForms_Jun2026`.
4. Conversion location: Instant forms.
5. Budget: start at $50/day.
6. Build the form from `content/ads/instant-form-blueprint.md`.
7. Form type: Higher intent.
8. Privacy policy URL:
   - `https://www.805shutters.com/privacy-policy/`
9. Completion screen CTA:
   - Call business.
   - `805-806-9344`.

## Campaign C - Retargeting

1. Create campaign.
2. Objective: Leads.
3. Name: `805_VC_Retargeting_Jun2026`.
4. Budget: start at $25/day.
5. Audiences:
   - Website visitors 30 days.
   - Facebook/Instagram engagers 365 days.
6. Exclude:
   - Recent leads 30 days if available.
7. Use review/project proof ads.

## Campaign D - Commercial

1. Create campaign.
2. Objective: Leads.
3. Name: `805_Commercial_WindowCoverings_Jun2026`.
4. Budget: start at $25/day after residential tracking is confirmed.
5. Destination:
   - `https://www.805shutters.com/commercial-window-coverings/`
6. Use the commercial creative set.

## First 72 hours

Do not make aggressive edits too early. Check:

- Spend.
- Delivery.
- Landing page views.
- Leads.
- Phone clicks.
- Comments.
- Obvious broken placement/cropping issues.

Pause only for:

- Broken tracking.
- Bad landing page behavior.
- Clearly wrong creative crop.
- Misleading comments.
- 50 landing page views with zero lead or phone-click activity.

Record results in `content/ads/optimization-dashboard.csv`.
