# Meta Ads Launch Plan — 805 Shutters

Built from the verified 2025-2026 window-treatment playbook (WTMP "Rule of 3",
Creekside home-services structure, LocaliQ/Focus Digital CPL benchmarks, Budget
Blinds franchise case data). No prices in any creative (house rule). All ads run
from **Ads Manager** — never the Boost button.

**Foundation already live (done 2026-07-06):** owned pixel 117872572252906 on
every page, server-side Conversions API Lead events, conversion-ready landing
pages (/shutters/ 92 speed score, lead forms + booking), CRM + instant SMS
follow-up. Ready-to-upload creative: `~/Desktop/805-facebook-posts/ad-creative/`
(1080×1080 + 1080×1350 crops of real installs, 2 install videos).

## Budget (Rule of 3, layered on $50/day Google)

Total Meta: **$25/day (~$750/mo)** to start — under the $1,500/mo "Meta-alone"
minimum, which is fine because Google stays the demand-capture engine.

| Campaign | Objective | Budget | Role |
| --- | --- | --- | --- |
| 1. Retargeting | Sales (website conversions → Lead) | $8/day | Close warm visitors |
| 2. Lead Gen | Sales (website conversions → Lead) | $12/day | Net-new homeowners |
| 3. Familiarity | Video views / Reach | $5/day | Real-faces trust videos |

Expectations (benchmarks): home-improvement Meta CPL **$40–85**; 30–45 days to
exit learning; judge at 60–90 days on blended CPL (Meta view → Google search →
convert paths under-credit Meta on last-click). Budget Blinds franchise
datapoint: 44% of FB leads → appointments.

## Audiences (manual — do NOT use Advantage+ audience)

- **RT-Warm**: website visitors 30d + FB Page engagers 365d + IG engagers 365d
  (page has 119 FB / 168 IG followers + years of Page history on the owned
  pixel). Exclude: leads/booked (site visitors of /thank-you/ 180d).
- **Cold-Homeowners**: Ventura County cities (Camarillo, Thousand Oaks, Simi
  Valley, Ventura, Oxnard, Moorpark, Westlake Village, Newbury Park) +15mi
  radius caps; age 30–65; interest stack: Home improvement, Interior design,
  New homeowners / recently moved. No income/political filters (unreliable).
- Later (needs 500+ customer emails from CRM): 1–2% Lookalike of customer list
  — the strongest cold audience; revisit once CRM export ≥500 rows.

## Campaign 1 — Retargeting ($8/day)

- Placement: Advantage+ placements ON (placements yes, audience no).
- Destination: https://www.805shutters.com/book-consultation/
- Creative A (single image, `ad-shutters-bay-window-1080sq.jpg`):
  - Primary: "Still thinking about your windows? Your free in-home consultation
    is one click away — we bring samples, measure everything, and give you a
    straight answer. Ventura County's local window treatment experts for 30 years."
  - Headline: "Free In-Home Consultation" · CTA: Book Now
- Creative B (testimonial, `ad-shutters-arch-1080x1350.jpg`):
  - Primary: ""Our gorgeous shutters were just installed and we could not be
    happier!" — Amanda S. ⭐⭐⭐⭐⭐ Join our happy Ventura County neighbors.
    Free in-home consultation, zero pressure."
  - Headline: "See Why Neighbors Choose 805" · CTA: Book Now

## Campaign 2 — Lead Gen ($12/day)

- Audience: Cold-Homeowners. Destination: https://www.805shutters.com/shutters/
  (highest-ticket product; the page now has the lead form + booking CTAs).
- Creative A (single image, `ad-shutters-patio-door-1080sq.jpg`):
  - Primary: "Sliding doors are where curtains go to die. Custom plantation
    shutters open fully, block the heat, and last decades. Measured and
    installed by the local crew that answers the phone — free in-home
    consultation anywhere in Ventura County."
  - Headline: "Custom Shutters, Measured Free" · CTA: Learn More
- Creative B (video, `recent-living-room-roller-shades.mp4`):
  - Primary: "Real install, real Ventura County home. Custom roller shades
    measured to the millimeter — no gaps, no light leaks. The consultation is
    free and we come to you." · Headline: "Free In-Home Consultation" · CTA: Book Now
- Test in week 3+: duplicate ad set as **Instant Form** (Higher-Intent form
  type, qualifying questions: own/rent + project timeframe) ONLY after the
  leads-webhook lands in the CRM (build: /api/meta-leads webhook → crm lead +
  Twilio instant text-back; not built yet).

## Campaign 3 — Familiarity ($5/day)

- Audience: Cold-Homeowners (broadened age 28–65+), optimize ThruPlay.
- Creative: `recent-bedroom-roller-shades-patio-view.mp4` (motorized demo) +
  future 15–30s phone videos of installs/team (REN case study: owner shoots,
  we edit). Primary: "Down for sleep, up for sunrise — without touching a
  cord. Motorized shades installed across Ventura County."

## Launch checklist (Ads Manager)

1. Events Manager → verify Lead event flowing (site form test) ✅ done via CAPI test event.
2. Create audiences (RT-Warm, Cold-Homeowners, thank-you exclusion).
3. Build 3 campaigns as above, CBO off, 7-day click / 1-day view attribution.
4. Turn OFF Advantage+ audience toggle in every ad set; keep placements auto.
5. UTM template: `utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}` (site attribution capture already reads these into the CRM lead).
6. Weekly review ritual: CPL by ad, pause anything >2× the best performer after
   ≥$50 spend; refresh creative monthly; never edit mid-learning without cause.

## Not yet / owner decisions

- Offer escalation: competitors run BOGO-50 style promos. Owner's no-prices
  rule → alternative urgency: "book this month, install before [season/holiday]".
  Decide before scaling past $25/day.
- Meta lead-forms webhook → CRM + instant text (build when Instant Forms test starts).
- Lookalike audience once CRM customer export ≥500.
- Scale rule: CPL ≤$60 sustained 2 weeks → raise Lead Gen +20%/week.
