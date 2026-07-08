# Google Ads Launch Plan — 805 Shutters (2026-07-05)

Account: **930-608-8641** (805shutters@gmail.com login). Google tag **AW-10898213628** — live on prod since 2026-07-05 (the old AW-1009321066 was bogus and has been replaced in Vercel env).
Conversion labels: lead `c5PqCKnsrcscEPyV1swo` · phone `xn01CKzsrcscEPyV1swo` (both Primary actions in the account).
Budget: **$150/day total** (~$4.5K/mo ramp tier). Scale decision after 2–3 weeks of real CPL data.
Benchmarks: industry $113 CPL, $7.69 CPC, 6.0% conv (LocaliQ 2025). Our economics: ~$410 CAC vs ~$1,480 gross profit/sale.

## Account-level settings

- **Networks:** Google Search only. Display Network OFF. Search partners OFF.
- **Locations (presence-only: "People in or regularly in"):** Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Newbury Park, Westlake Village, Ojai, Port Hueneme, Santa Paula, Oak Park, Fillmore, Santa Rosa Valley (CA).
- **Bidding at launch:** Maximize Clicks with **$10.00 max CPC cap** for ~2 weeks / ~30 conversions, then switch to Maximize Conversions.
- **Conversions:** `generate_lead` (lead form + self-booking) = Primary. `phone_click` = Primary (calls are real appointment requests). Booking-step events = Secondary/observation only.
- **Final URL suffix (account level):** `utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={creative}`
  (site's client-tracking.ts forwards utm_* into every lead event → CRM attribution works out of the box).
- **Ad schedule:** all days, 6am–10pm (calls/forms answered same-day; after 10pm quality drops).

## Campaign 1 — Shutters | Ventura County ($90/day)

Flagship, highest ticket. Landing page: `/shutters/`.

**Ad group: Plantation Shutters** — keywords (phrase + exact):
- "plantation shutters", "plantation shutters near me", "plantation shutters cost"*, "custom shutters", "interior shutters", "wood shutters", "shutter installation", "plantation shutters camarillo", "plantation shutters thousand oaks", "plantation shutters ventura", "shutters oxnard", "shutters simi valley", "window shutters near me"

*"cost" searches convert well but our site is price-silent — the free-consultation offer is the answer; keep and watch.

## Campaign 2 — Blinds & Shades | Ventura County ($60/day)

**Ad group: Custom Blinds** — landing `/blinds/`:
- "custom blinds", "blinds near me", "window blinds installation", "motorized blinds", "blinds camarillo", "blinds thousand oaks", "blinds ventura county", "faux wood blinds"

**Ad group: Shades** — landing `/shades/`:
- "roman shades", "roller shades", "custom window shades", "motorized shades", "cellular shades", "honeycomb shades", "shades near me", "zebra shades"

## Shared negative keyword list ("805 Negatives" — apply to both campaigns)

repair, repairs, fix, cleaning, clean, parts, replacement slats, DIY, "how to",
jobs, hiring, careers, salary, camera, "shutter speed", photography, photo,
hurricane, storm shutters, exterior shutters, home depot, lowes, lowe's, ikea,
amazon, walmart, costco, used, cheap, discount, wholesale, rental, car, auto,
rv, boat, curtains rod, island (shutter island)

## Responsive Search Ads (both campaigns; swap product word per ad group)

**NO PRICES in any ad copy — owner rule.**

Headlines (≤30 chars):
1. Custom Plantation Shutters / Custom Blinds & Shades
2. Free In-Home Consultation
3. Ventura County Local Experts
4. Locally Owned & Operated
5. 30+ Years of Experience
6. Flexible Financing Available
7. Expert Installation Included
8. Book Your Free Consultation
9. Shutters, Blinds & Shades
10. We Bring the Showroom to You
11. Top-Rated Local Service
12. Made-to-Measure Quality
13. Serving Camarillo & Beyond
14. Fast, Professional Install
15. Design Help at No Charge

Descriptions (≤90 chars):
1. Custom window treatments designed, measured & installed by local pros. Free consultation.
2. Family-owned Ventura County company. We bring samples and design advice to your home.
3. Flexible financing available. Book your free in-home design consultation today.
4. Serving Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley & all of Ventura County.

## Assets (extensions)

- **Call:** 805-806-9344 (call reporting ON)
- **Sitelinks:** Free Consultation → /book-consultation/ · Reviews → /reviews/ · Financing → /financing/ · Recent Projects → /recent-projects/
- **Callouts:** Free In-Home Consultation · Flexible Financing · Locally Owned · Expert Installation · Custom Made-to-Measure
- **Location:** link Google Business Profile
- **Structured snippet:** Types: Plantation Shutters, Roman Shades, Roller Shades, Motorized Blinds, Drapery

## Week-1/2 checklist

- [ ] Day 2: search-terms report → add negatives
- [ ] Day 3: confirm conversions recording (test lead + phone click)
- [ ] Week 2: pause keywords with >$40 spend and no click-through engagement
- [ ] Week 2–3: if ≥15 conversions, switch bidding to Maximize Conversions
- [ ] Week 3: CPL review vs $113 benchmark → scale/hold decision with Mike
