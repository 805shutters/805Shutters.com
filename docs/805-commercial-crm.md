# 805 Commercial CRM

Commercial and Referrals is a company-wide relationship, referral, and bid pipeline. It does not mix commercial prospecting with residential customer jobs.

## What is included

- A live prospect ledger with company, decision-maker, phone, email, source, license details, next action, due date, stage, priority, and estimated opportunity value.
- A seeded Ventura County starting list covering school facilities, public procurement, general contractors, architects, commercial property managers, and commercial real estate.
- Official prospect-source links for CSLB, California school data, Ventura County Bonfire, Cal eProcure, local permit research, and BuildingConnected.
- CSV and tab-delimited imports with duplicate protection.
- Optional live Google Places discovery. Results are temporary discovery aids and must be confirmed on the prospect's own website before being saved.
- Personalized outreach templates for GCs, facilities/schools, property managers, and architects.
- Preview-before-send batches capped at 25 recipients.
- Gmail reply matching, automatic activity history, and automatic do-not-contact handling for opt-out replies.
- A 90-day launch plan, weekly activity rhythm, first-call script, bid qualification checklist, and capability-package checklist.

## Required production setup

1. Apply `supabase/migrations/20260709143000_create_commercial_growth_crm.sql` to the dedicated 805 Supabase project.
2. Keep the existing Resend variables configured.
3. Set `COMMERCIAL_OUTREACH_POSTAL_ADDRESS` to the valid physical postal address that must appear in commercial email.
4. Keep the existing Gmail OAuth or token broker configured if reply sync is desired.
5. Keep `GOOGLE_MAPS_API_KEY` configured with Places API (New) if live discovery is desired.

Sending remains locked until a postal address is configured. This is intentional: federal CAN-SPAM rules apply to B2B commercial email as well as consumer email.

## Operating rule

Every prospect must always have one next action and one due date. A company only moves to `Ready` after the correct decision-maker and a confirmed business email are known. Every call, meeting, reply, bid invitation, and submitted bid is recorded in the relationship history.

## Official source notes

- CSLB's classification-and-county download supplies license number, business name, address, phone, status, classification, bond, and workers-compensation information. CSLB does not supply email addresses.
- D-52 is California's window-coverings contractor classification. The CRM keeps license status as `Unverified` until a current CSLB check has been completed.
- California school directory data is useful for outreach but is self-reported and can be incomplete or outdated. Confirm the facilities or purchasing contact before outreach.
- Google Places content is not used as a permanent unattended database. The UI attributes live results to Google and asks the user to confirm durable contact details on the prospect's own website.
