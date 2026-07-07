# 805 Shutters Growth Plan

Dated: July 7, 2026  
Owner: Mike Hill  
Goal: double the business without hiring an agency, using the stack already built for 805shutters.com.

## Page 1 - Executive Summary

### Goal in one sentence

Double 805 Shutters from about $37,600/month to about $75,200/month in booked revenue by adding about 60 paid leads/month, protecting close rate, and expanding install capacity before operations choke.

### The 3 numbers that matter

| Number | Current | Double-business target | Source |
| --- | ---: | ---: | --- |
| Revenue | $37,596/month | $75,192/month | Measured: CRM bookkeeping ledger, Apr-Jun 2026 |
| Jobs sold | 12.0/month | 24.0/month | Measured: 36 ledger jobs Apr-Jun 2026 |
| Appointments needed | about 6.2/week implied | about 12.4/week | Measured quote-close rate plus revenue math |

### Next 5 actions

| Date | Action | Mike approval needed? | Owner time |
| --- | --- | --- | ---: |
| Tue Jul 7, 2026 | Approve Track B spend cap: $10,150 maximum ad cash at risk for the first 60 days. | Yes | 5 min |
| Wed Jul 8, 2026 | Turn on Meta Business Manager 2FA, confirm Google Ads admin backup, and keep all tokens in owner-controlled accounts. | No spend | 20 min |
| Thu Jul 9, 2026 | Apply the pending lead-source production SQL so Google/Meta leads show correctly in the CRM. | No spend | 10 min |
| Fri Jul 10, 2026 | Launch Meta campaigns from `docs/meta-ads-plan.md` at $25/day: retargeting, lead-gen, familiarity video. | Yes | 15 min |
| Mon Jul 14, 2026 | Add Blinds/Shades Google Search campaign if Mike approves Week 2 spend. | Yes | 10 min |

### Recommendation

Choose **Track B: aggressive, agency-equivalent**.

Reason: Track A is safer, but it likely produces only 19-35 paid leads/month at benchmark CPLs. The math says 805 needs about 60 incremental paid leads/month to double from the current baseline. Track B reaches the required lead volume by the end of Month 2 while still using the same methods: Google demand-capture first, Meta second, manual audiences, no Boost buttons, no public prices, no public discounts, and no agency retainer.

Every spend increase below is an approval checkpoint. Nothing scales unless Mike explicitly approves it.

## Ground Truth Used

### Local docs read before writing

- `~/Desktop/805-project-memory/MEMORY.md`
- `805-conversion-funnel.md`
- `805-agency-research.md`
- `805-marketing-plan.md`
- `805-google-ads-launch.md`
- `805-seo.md`
- `805-crm-profit-rules.md`
- `docs/meta-ads-plan.md`
- `docs/facebook-page-kit.md`
- `docs/google-ads-campaign.md`

### Live CRM snapshot

Pulled from the 805 Supabase CRM on July 7, 2026.

| Table / source | Measured count | What it means |
| --- | ---: | --- |
| `crm_quote_bookkeeping_entries` | 48 rows | Best historical revenue ledger |
| `crm_jobs` | 95 rows | Job pipeline and appointment fields |
| `crm_quotes` | 79 rows | CRM quote funnel and quote-close rate |
| `leads` | 14 rows | Website/self-booking lead capture, small sample |
| `crm_calendar_events` | 2 rows | Calendar is too new to prove historical appointment volume |
| `sales_quotes` | 12 rows | New quote-builder ledger only; not enough for historical baseline |
| `crm_customers` | 75 rows | Customer list is below the 500+ lookalike threshold |

Important data issue: the production database does not yet have the newer `lead_source` columns. Apply `supabase/apply-pending-to-prod.sql` before judging channel attribution.

## Baseline and Math

### Baseline table

| Metric | Current measured baseline | Confidence | How measured |
| --- | ---: | --- | --- |
| Revenue | $112,788 Apr-Jun, or $37,596/month | High | `crm_quote_bookkeeping_entries.sold_date` and `total_amount` |
| Jobs sold | 36 Apr-Jun, or 12.0/month | High | Same ledger |
| Average ticket | $3,133 | High | $112,788 / 36 jobs |
| Quote-to-close rate | 44.6% Apr-Jun; 48.5% last 90 days | Medium-high | `crm_quotes`: 25 sold / 56 quoted Apr-Jun; 33 / 68 last 90 |
| Website lead-to-booked rate | 42.9%; use 45% for planning | Low sample | `leads`: 6 booked / 14 total |
| Gross margin after COGS, Ken cut, recorded install invoices | 38.4% Apr-Jun | Medium | Ledger math; install invoices missing on many rows |
| Material-only gross margin | 50.5% Apr-Jun | Medium | Revenue minus COGS only |
| Explicit CRM appointment volume | 2.6/week last 30-60 days | Low | `crm_jobs.appointment_start`; undercounts phone/manual appointments |
| Implied current appointment volume | about 6.2/week | Medium | 12 jobs/month / 44.6% close / 4.33 weeks |
| Installed capacity | Assumed 18 installs/month until Mike confirms | Assumption | Not stored cleanly in CRM; see Appendix A |

### Doubling math

1. Current monthly revenue: `$112,788 / 3 = $37,596`.
2. Double-business target: `$37,596 x 2 = $75,192/month`.
3. Jobs needed at current average ticket: `$75,192 / $3,133 = 24.0 jobs/month`.
4. Appointments needed at 44.6% quote-close: `24.0 / 0.446 = 53.8 appointments/month`.
5. Appointments per week: `53.8 / 4.33 = 12.4 appointments/week`.
6. Leads needed at 45% lead-to-appointment: `12.4 / 0.45 = 27.6 leads/week`, or about 120 leads/month.
7. Current implied lead equivalent: `6.2 current appointments/week / 0.45 = 13.8 leads/week`.
8. Incremental paid lead target: `27.6 - 13.8 = 13.8 incremental leads/week`, or about 60 incremental paid leads/month.

### Per-channel target budget

Target to double: about 60 incremental paid leads/month.

| Channel | Budget shape | Planning CPL | Worst benchmark CPL | Leads/month at $6,000 total spend | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Google Search + LSA if approved | 60% = $3,600 | $100 blended | $126 Search; $53 LSA | 29-49 | Search is live now; LSA only if Google approves the category |
| Meta lead-gen + retargeting | 30% = $1,800 | $65 | $85 | 21-45 | Manual audiences only; no Advantage+ audience |
| Meta awareness video | 10% = $600 | No direct CPL target | No direct CPL target | 0 direct | Builds local familiarity and retargeting pools |
| Total | $6,000/month | about $94 blended | about $120 blended | 50-94 | 50 leads still adds about 10 jobs/month; 60+ leads reaches double math |

If LSA is approved, use it immediately inside the Google 60% bucket. If LSA is rejected or unavailable for window treatments, do not chase it; keep demand-capture spend in Search and brand defense.

### Current bottleneck

Current bottleneck: **qualified appointment volume and trust signal volume**, not close rate. The current quote-close rate is usable, the average ticket is strong, and paid CAC can work. The weak spots are lead volume, incomplete attribution, only 14 Google reviews, and unproven install capacity.

Bottleneck re-checks:

| Phase | Re-check | If this is true | Decision |
| --- | --- | --- | --- |
| Weeks 1-2 | Attribution and speed-to-lead | Lead source is missing or response is over 5 minutes | Fix tracking/alerts before raising spend |
| Weeks 3-6 | CPL and appointment set rate | CPL is on target but appointment set rate is under 40% | Fix follow-up script and lead quality before scaling |
| Weeks 7-13 | Sales and install capacity | Appointments exceed 12/week or rolling sold jobs exceed 16/month | Add sales blocks, add install help, or pause budget increases |
| Months 4-12 | Reviews and conversion | Reviews miss monthly target or quote-close falls under 40% | Shift work to review requests and sales process before adding spend |

## Doctrine for All Tracks

These rules are not optional:

- Google demand-capture first: Search now, LSA only on approval.
- Meta second: retargeting, manual local lead-gen, and owner-shot video.
- Budget shape: 60% Google, 30% Meta lead-gen/retargeting, 10% Meta awareness video.
- No Advantage+ audiences for local. Use manual local homeowner audiences.
- No Boost button. Ads Manager only.
- Meta Instant Forms only as Higher-Intent forms with qualifying questions and instant text webhook.
- No public prices and no public discounts. Public offer is only free in-home consultation.
- Use real install videos, before/after photos, and review quotes.
- Judge channels on blended CPL after 60-90 days, not week one.
- No agency. The agency playbook is already mostly built in this repo.

## Track A vs Track B

| Item | Track A: steady | Track B: aggressive, recommended |
| --- | --- | --- |
| Starting spend | About $2,250/month now | About $2,250/month now, then scale weekly with approval |
| End of Month 2 spend | $2,250-$3,250/month if CPL holds | $5,000-$8,000/month by end of Month 2 |
| Channels | Live Shutters Google + $25/day Meta | Shutters Google, Blinds/Shades Google in Weeks 2-3, LSA on approval, Meta to $1,500 lead/retargeting run-rate by Week 6 |
| Scaling rule | Only +20%/week after CPL is <= target for 2 straight weeks | Same rule unless Mike explicitly approves faster testing cash exposure |
| Expected paid leads/month | 19-35 | 50-94 at $6,000/month; 62-117 at $7,500/month |
| Expected extra jobs/month | 4-7 | 10-23 |
| Time to doubling math | Slow; may not double without organic/review lift | Realistic within 90-180 days if close rate and capacity hold |
| 60-day worst-case cash exposure | About $4,500 if held flat and zero closes | About $10,150 planned ramp if zero closes |
| Best owner fit | Mike wants low cash risk and slower learning | Mike wants agency-level growth without paying an agency |

Track B worst-case cash exposure: if the first 60 days produce zero closes, Mike has spent about **$10,150** on media. At worst benchmark CPLs, that spend should still buy lead volume and learning, but cash recovery would be delayed. Mike should only approve Track B if he is comfortable risking that 60-day amount.

## 90-Day Week-by-Week Sprint

Recommended sprint: Track B. If Mike chooses Track A, use the same actions but keep spend at Week 1 levels until the 2-week CPL rule allows a +20% increase.

Expected leads below use benchmark ranges only: Google Search $74-$126 CPL, Meta $40-$85 CPL. Awareness video spend is not counted as direct leads.

| Week | Dates | Exact actions | Owner minutes | Spend | Expected leads | One KPI |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 1 | Jul 7-13 | Keep Shutters Google at $50/day. Launch Meta plan at $25/day after approval. Turn on Meta BM 2FA. Apply lead-source SQL. Confirm SMS alerts. | 60 | $525 | 4-8 | Lead response under 5 minutes |
| 2 | Jul 14-20 | Launch Blinds/Shades Google campaign after approval. Add shared negatives. Confirm final URLs use `www`. Publish first 2 Facebook posts. | 45 | $875 | 7-13 | Search terms reviewed, junk terms blocked |
| 3 | Jul 21-27 | Add sitelinks/callouts where missing. Build Meta App for lead forms but keep forms off until webhook is verified. Shoot 2 install videos. | 60 | $875 | 7-13 | 2 usable owner-shot videos captured |
| 4 | Jul 28-Aug 3 | If CPL is not broken, approve ramp to about $1,050/week. Start brand-defense Google campaign against `805shuttersandshades.com`. | 30 | $1,050 | 9-16 | Blended CPL at or below $120 |
| 5 | Aug 4-10 | Test Higher-Intent Meta Instant Form with own/rent and project-timeframe questions. Keep website lead campaign live. | 45 | $1,225 | 10-19 | Meta lead-to-appointment at or above 35% |
| 6 | Aug 11-17 | Ramp Meta lead-gen/retargeting run-rate toward $1,500/month after approval. LSA goes live immediately if approved. | 30 | $1,400 | 12-22 | 10+ appointments/week scheduled |
| 7 | Aug 18-24 | First creative refresh: replace worst Meta ad, add new before/after, rotate one review quote. Audit appointment no-shows. | 45 | $1,575 | 13-25 | No-show rate under 15% |
| 8 | Aug 25-31 | Reach $7,500/month run-rate only if approved. Check sales and install capacity before any more increases. | 45 | $1,750 | 15-27 | Rolling sold jobs <= capacity trigger |
| 9 | Sep 1-7 | Hold spend unless CPL and capacity both pass. Launch September heat/glare and back-to-routine creative. | 30 | $1,750 | 15-27 | Blended CPL 60-day trend |
| 10 | Sep 8-14 | Quote-close audit: review all unsold quotes older than 7 days, send follow-up texts, schedule callbacks. | 60 | $1,750 | 15-27 | Quote-close stays at or above 44% |
| 11 | Sep 15-21 | Review sprint: every installed customer gets in-person ask, automated text, and one manual follow-up. | 45 | $1,750 | 15-27 | Google reviews hit monthly target |
| 12 | Sep 22-28 | Decide next 30-day budget: +20%, hold, or cut by channel. Refresh Google negatives and Meta creative. | 30 | $1,750 | 15-27 | Approved October budget |
| 13 | Sep 29-Oct 5 | 90-day review: revenue, jobs, CPL, appointments, quote-close, reviews, capacity. Lock Month 4 plan. | 45 | $1,750 | 15-27 | 90-day go/hold/scale decision |

## Months 4-12 Plan

Seasonality note: do not assume demand disappears in fall or winter. Research supports different messages by season: spring to mid-summer home-and-garden clicks stay strong; summer and winter both create window-treatment needs because window coverings help with solar heat gain, insulation, glare, comfort, and privacy. Use season-specific creative, not public discounts.

| Month | Dates | Budget rule | Main actions | Seasonality angle | KPI |
| --- | --- | --- | --- | --- | --- |
| 4 | Oct 2026 | Hold or +20% if 2-week CPL holds and capacity is green | Refresh Meta videos, keep Google negatives clean, add review quotes | Fall privacy, comfort, holiday-ready rooms | 16+ jobs/month |
| 5 | Nov 2026 | Hold if holiday response slows; do not panic-cut before 60-day data | Push retargeting and brand search; review sprint | Guest rooms, glare, privacy, insulation | 50+ Google reviews |
| 6 | Dec 2026 | Keep demand-capture live; reduce only poor CPL ad sets | Smaller creative refresh; schedule January follow-ups | Winter comfort, privacy, motorized convenience | Lead response under 5 minutes |
| 7 | Jan 2027 | Resume +20% if CPL and capacity pass | New-year home refresh creative; audit all stale quotes | Home refresh, organization, comfort | Quote-close >= 44% |
| 8 | Feb 2027 | Pre-spring ramp if December/January close rate held | Shoot 4 videos before spring; check install calendar | Pre-spring planning | 12+ appointments/week |
| 9 | Mar 2027 | Increase before spring demand if capacity is ready | Google budget expansion inside Search/LSA only; Meta lookalike still locked until 500 customers | Spring home improvement | Blended CPL <= $100 target |
| 10 | Apr 2027 | Scale winners; cut losers | New before/after set, GBP photo update, citation cleanup | Spring to mid-summer home projects | 24 jobs/month run-rate |
| 11 | May 2027 | Keep 60/30/10 unless one channel breaks | Solar/roller/motorized shade creative; refresh landing page examples | Heat, glare, west-facing windows | 20+ booked appointments/month from paid |
| 12 | Jun 2027 | Annual budget decision | Decide whether to keep owner-managed, hire only execution help, or add second installer | Summer heat and light control | 100+ Google reviews |

Lookalike unlock: do not use a customer-list lookalike until the CRM has 500+ real customers. Current measured customer count is 75. Recheck monthly. When it reaches 500, test a 1%-2% lookalike against manual homeowner audiences with a strict local geo cap.

Instant Forms timing: begin only in Week 5 after the Meta App, webhook, dedupe, CRM insert, and instant text-back are verified. Use Higher-Intent form type and qualifying questions. If form leads do not book at 35%+ after 30 leads, pause the form and keep website conversion campaigns.

## Review Velocity Plan: 14 to 100+

Current Google Business Profile review count: 14. Target: 100+ by June 30, 2027.

Required lift: `100 - 14 = 86 new reviews`. Over 12 months, that is about `86 / 12 = 7.2 reviews/month`.

At the doubled job target of 24 jobs/month, 8 reviews/month requires about a 33% review rate. That is realistic if the ask is made in person and the CRM automation fires.

| Month-end | Target Google review count |
| --- | ---: |
| Jul 2026 | 22 |
| Aug 2026 | 30 |
| Sep 2026 | 38 |
| Oct 2026 | 46 |
| Nov 2026 | 54 |
| Dec 2026 | 62 |
| Jan 2027 | 70 |
| Feb 2027 | 78 |
| Mar 2027 | 86 |
| Apr 2027 | 94 |
| May 2027 | 100 |
| Jun 2027 | 104+ |

Review process:

1. Installer says the review ask in person before leaving: "If you are happy with the install, a Google review helps local homeowners find us."
2. CRM sends the automated review text when the job moves to installed/invoiced.
3. Mike or Jessica sends one manual follow-up 72 hours later to happy customers who have not reviewed.
4. Monday ritual checks review count and last week's installed jobs.
5. No incentives, no discounts, no review gating.

## Capacity Check

The plan can create more demand than the current operation can absorb. That is a good problem only if it is seen early.

Current CRM operational signals:

- 45 jobs are quoted.
- 5 jobs are sold.
- 25 jobs are ordered.
- 18 jobs are closed.
- Calendar install events are not tracked well enough to prove install capacity.

Assumption until Mike replaces it: current install capacity is 18 installs/month. That is not a CRM-proven number.

Capacity triggers:

| Trigger | When it happens | Action |
| --- | --- | --- |
| Sales bottleneck | Appointments exceed 12/week for 2 weeks or quotes are not sent within 24 hours | Add fixed consult blocks, tighten follow-up, consider another sales helper |
| Install warning | Rolling 30-day sold jobs hit 16 | Pre-book installer days and stop increasing spend until install calendar is reviewed |
| Install bottleneck | Rolling 30-day sold jobs hit 20 or ordered backlog exceeds 30 | Add a second installer/subcontractor or cap ad increases |
| Cash-flow bottleneck | Deposits are slow or balances stack up | Push payment links and payment-plan setup before increasing spend |

Week capacity likely becomes the bottleneck in Track B: **Week 8 to Week 10** if spend reaches the $7,500/month run-rate and CPL is near target. That is when expected paid leads reach 15-27/week, which can add about 3-5 sold jobs/week on top of the current baseline.

## Mike's Monday 30-Minute Ritual

Do this every Monday. Do not skip it.

| Minute | Check | Decision rule |
| ---: | --- | --- |
| 0-5 | Spend by channel and budget pacing | If spend is above approved cap, pause increases immediately |
| 5-10 | Leads, CPL, and source attribution | If `lead_source` is blank or wrong, fix tracking before judging ads |
| 10-15 | Speed-to-lead and appointment set rate | If response is over 5 minutes or set rate under 40%, fix follow-up before more spend |
| 15-20 | Quote-close and stale quotes | If quote-close is under 40%, review unsold quotes before raising budget |
| 20-25 | Reviews and creative | If reviews are behind target, run the review sprint; if Meta frequency is high, rotate creative |
| 25-30 | Capacity | If rolling sold jobs are near install capacity, do not approve the next spend increase |

Simple if-then rules:

- If blended CPL is <= $100 for 2 weeks, appointment set rate is >= 40%, and capacity is green, Mike may approve +20% spend.
- If blended CPL is $101-$126, hold spend and optimize.
- If blended CPL is above $126 for 2 weeks, cut the worst ad set/campaign and repair search terms, landing page, or creative.
- If Meta CPL is above $85 after at least $300 spend, pause the worst creative and replace it with owner-shot install video.
- If Google CPL is above $126 after meaningful spend, inspect search terms before changing bids.
- If no one can call/text a lead within 5 minutes, do not buy more leads yet.

## Risks and Counters

| Risk | Counter |
| --- | --- |
| Copycat/brand squatter `805shuttersandshades.com` | Run brand-defense Google campaign, keep NAP consistent, build GBP reviews, consider name/trademark advice if needed |
| Ad fatigue | Owner shoots 2 short install videos/month; refresh Meta creative monthly; rotate review quotes |
| Platform account loss | Enable Meta BM 2FA, add backup admins, document Google Ads and Meta account ownership |
| Single-installer dependency | Add secondary installer before sold-job volume crosses 20/month |
| Seasonality dip | Change message by season: heat/glare in summer, privacy/comfort/insulation in fall/winter; do not use public discounts |
| Lead quality from Meta forms | Higher-Intent only, qualifying questions, instant text webhook, pause if appointment rate under 35% |
| Bad attribution | Apply pending lead-source SQL; inspect CRM lead source every Monday |
| Agency temptation | Compare any agency pitch to this plan. Do not pay $20K-$36K/year for work already built here |

## Appendix A - Measured vs Assumed Numbers

| Number | Value used | Type | Replace with |
| --- | ---: | --- | --- |
| Revenue baseline | $37,596/month | Measured | Re-query `crm_quote_bookkeeping_entries` by `sold_date` |
| Job baseline | 12.0/month | Measured | Same ledger |
| Average ticket | $3,133 | Measured | Same ledger |
| Quote-to-close | 44.6% | Measured | Re-query `crm_quotes` quoted vs sold for the latest 90 days |
| Lead-to-appointment | 45% | Measured but low sample | Re-query `leads` after lead-source migration and 50+ new leads |
| Gross margin | 38.4% after COGS/Ken/recorded install | Measured with missing install caveat | Finish installer invoice matching; then re-run bookkeeping |
| Google Search CPL | $74-$126 | Benchmark from agency research docs | Replace with 805's actual 60-day Google CPL |
| LSA CPL | about $53 | Benchmark; approval not proven | Replace only if LSA is approved and live |
| Meta CPL | $40-$85 | Benchmark from agency research docs | Replace with 805's actual 60-day Meta CPL |
| Meta lead-to-appointment | 44% | Benchmark and close to 805 lead sample | Replace with 805 Meta source data after 30+ Meta leads |
| Install capacity | 18 installs/month | Assumption | Mike confirms real monthly installer capacity and lead times |
| Sales appointment capacity | 12 appointments/week warning line | Assumption based on doubling math | Mike confirms weekly consult slots for Mike/Jessica |
| Customer count for lookalikes | 75 | Measured | Re-query `crm_customers`; unlock at 500+ |

## Appendix B - Source Notes

Internal sources:

- Live 805 Supabase CRM, queried July 7, 2026.
- `src/lib/crm/bookkeeping.ts` for profit and ledger logic.
- `docs/meta-ads-plan.md` for Meta budget, audiences, creative, and launch checklist.
- `docs/google-ads-campaign.md` for Google campaign structure, settings, and negative keywords.
- `docs/facebook-page-kit.md` for Facebook page setup and posting rhythm.

External seasonality and energy-efficiency references:

- Microsoft Advertising reports home-and-garden clicks staying high through spring and mid-summer and notes home improvement search lift: https://about.ads.microsoft.com/en/blog/post/february-2024/seasonal-spotlights-home-and-garden-advertising-in-the-spring-season
- U.S. Department of Energy window attachment materials support summer/winter energy messaging for cellular shades and other window attachments: https://www.energy.gov/sites/default/files/2021-12/bto-cellular-shades-factsheet-112221.pdf
- DOE-backed cellular shade evidence supports heat-loss and solar-gain reduction messaging: https://www.energy.gov/cmei/buildings/articles/doe-recognizes-10-storm-window-and-window-attachment-programs-their-impact
- BlindsGalore's seasonal guide supports summer cooling, winter insulation, and room-comfort messaging: https://www.blindsgalore.com/blog/index.php/beyond-basics/seasonal-window-treatment-updates/
