# Facebook and Instagram heavy-launch plan

Date: 2026-06-01

## Launch objective

Generate consultation requests and phone calls for custom shutters, shades,
blinds, and commercial window coverings in Ventura County.

## Strategy

Use a two-lane lead system:

1. Website leads: send traffic to `/free-window-treatment-consultation/` and
   optimize for `Lead`.
2. Instant-form leads: use Meta lead forms for lower-friction mobile leads and
   qualify them with a few project questions.

Run retargeting separately so warm visitors see proof, reviews, recent installs,
and reminder CTAs instead of the same cold prospecting ad.

## Pre-launch gates

Do not scale budget until these are confirmed:

1. Landing page is live.
2. Thank-you page redirect works after form submit.
3. Meta Pixel Helper shows only the intended active pixel.
4. Events Manager receives one `Lead` event for a test form submission.
5. Events Manager receives one `Contact` event for a test phone click.
6. GA4 Realtime shows `generate_lead` and `phone_click`.
7. UTMs appear in GA4 traffic acquisition.
8. `/privacy-policy/` is live and linked from the lead form and footer.

## Budget recommendation

Heavy but controlled local launch:

- Days 1-3: $100/day total while tracking and creative QA are verified.
- Days 4-14: $175/day total if leads are clean.
- Days 15-30: $250/day total if cost per qualified lead is acceptable.

Do not double the budget overnight. Raise spend in 20-30 percent increments
after 48 hours of stable delivery and acceptable lead quality.

## Campaign architecture

### Campaign A - Website Leads

- Objective: Leads.
- Conversion location: Website.
- Optimization event: Lead.
- Daily budget at launch: $75.
- Landing page: `/free-window-treatment-consultation/`.
- Placements: Advantage+ placements on, but inspect placement breakdown after
  the first 1,000 impressions.
- Ad sets:
  - `VC_Broad_AdvantagePlus`
  - `CoreCities_AdvantagePlus`
  - `HomeImprovement_Suggestions`

### Campaign B - Instant Form Leads

- Objective: Leads.
- Conversion location: Instant forms.
- Daily budget at launch: $50.
- Form type: Higher intent.
- Form questions:
  - What are you interested in?
  - Which city is the project in?
  - When are you hoping to get started?
  - Is this for a home or business?
- Use an intro screen that repeats the local offer and phone number.

### Campaign C - Retargeting and Proof

- Objective: Leads.
- Daily budget at launch: $25.
- Audiences:
  - Website visitors 30 days.
  - Facebook/Instagram engagers 365 days.
  - Video viewers 25 percent, 30 days, once video spend starts.
- Exclusions:
  - Recent leads 30 days if available.
- Creative:
  - Recent installs.
  - Review proof.
  - Before/after.
  - Product comparison.

### Campaign D - Commercial Window Coverings

- Objective: Leads.
- Daily budget at launch: $25 after residential tracking is confirmed.
- Landing page: `/commercial-window-coverings/`.
- Audience:
  - Broad local business decision-makers and retargeting.
  - Use audience suggestions where available, but keep location as the hard
    control.

## Audience controls

Hard controls:

- Location: Ventura County service area and nearby cities actually served.
- Minimum age: 18+.
- Language: English unless there is Spanish creative and follow-up.
- Exclude recent leads when possible.

Audience suggestions:

- Home improvement.
- Interior design.
- Remodeling.
- Real estate/homeowners.
- Window treatments.
- Plantation shutters.
- Blinds and shades.

Do not over-segment by product at launch. Use creative and landing page intent
to teach the algorithm, then split winners later.

## Creative mix

Launch with at least 15 ads:

- 5 static/image ads.
- 5 short vertical videos or slideshow-style videos.
- 3 carousel ads.
- 2 retargeting proof ads.

Required aspect ratios:

- 4:5 feed creative: 1080 x 1350.
- 1:1 square fallback: 1080 x 1080.
- 9:16 Stories/Reels: 1080 x 1920.

Starter exports are generated in `public/ads/` by:

```bash
node scripts/generate_meta_creatives.mjs
```

## Offer

Primary offer:

```text
Free in-home window treatment consultation
```

Secondary proof:

```text
Family-owned Ventura County company with over 30 years of local experience.
```

Primary CTA:

```text
Schedule Now
```

Secondary CTA:

```text
Call 805-806-9344
```

## Week-one optimization rules

Check daily, but avoid emotional edits before there is enough data.

Pause ad after:

- 1,500 impressions with no landing page views.
- 50 landing page views with no lead or phone click.
- Clearly bad comments or misleading creative fit.

Scale ad set after:

- At least 3 qualified leads.
- Cost per qualified lead is within target.
- Lead quality is acceptable by phone follow-up.

Move budget toward:

- Ad sets producing booked consultations.
- Creative with strong click-to-lead rate.
- Cities with real appointment potential, not just cheap form fills.

## Reporting cadence

Daily:

- Spend.
- Leads.
- Phone clicks.
- Cost per lead.
- Form quality notes.

Twice weekly:

- Creative winners/losers.
- Placement performance.
- City/product demand.
- Follow-up status.

Weekly:

- Cost per qualified lead.
- Booked appointment rate.
- Sold-job estimate if available.
- Budget shift recommendation.
