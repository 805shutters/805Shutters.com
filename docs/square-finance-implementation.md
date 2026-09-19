# Square finance implementation

Scope: 805 CRM. Authorized September 19, 2026. No customer charges, refunds,
transfers, or customer messages are part of this implementation. Mike subsequently
authorized one payment SMS to 805-298-5555 for each new completed payment.

## Task checklist

- [x] Inspect current production webhook configuration and backup job.
- [x] Isolate current origin/main from unrelated local work.
- [x] Inspect current payment reconciliation and CRM navigation.
- [x] Remove obsolete Hermes requirement; Mike confirmed Codex should proceed directly.
- [x] Implement durable event ingestion, authenticated API recovery, and health reporting.
- [x] Unify payment identity and prevent duplicate legacy/email posting.
- [x] Add payment review, allocation, and audit controls.
- [x] Add fee, refund, dispute, payout, and payout-entry tracking.
- [x] Add bank reconciliation and exports with explicit evidence references.
- [x] Add authenticated Square workspace and payment/payout drilldowns.
- [x] Complete job finance and payment-request views.
- [x] Add owner-only payment SMS to 805-298-5555 with duplicate protection and delivery callbacks.
- [x] Verify live SMS configuration; no historical/test payment alert is authorized.
- [x] Validate migration and financial invariants in an isolated database.
- [x] Run focused tests, full suite, typecheck, build, and browser verification.
- [x] Review payment behavior, migration, authentication, and secret changes.
- [x] Apply reviewed migration, publish intended changes, and verify production.
- [x] Verify the scheduled recovery job against the live API, including historical batches.
- [x] Verify readable desktop/tablet UI and payment receipt/matching drilldown.
- [x] Complete historical coverage and report unmatched evidence; owner decisions remain for unproven matches.
- [ ] Restore Square console sign-in, configure the production subscription, and verify delivery.
- [ ] Observe delivery of an owner SMS after the next real new customer payment.

## Invariants

- One Square payment identity across webhooks, API imports, and email evidence.
- A completed customer payment credits the gross amount, never the amount after fees.
- Pending or failed payments do not reduce customer balances.
- Unknown fees remain unknown until Square supplies them.
- A payout is a transfer, not additional customer revenue.
- Square payout status does not establish bank-statement receipt.
- Payment state never completes installation or closes an operational job.
- Unidentified payments remain visible for review; do not infer company ownership.
- A name, phone number, amount, or email receipt alone cannot authorize ledger posting.
- Historical imports preserve existing payments and allocations; confirmed matches link
  to existing entries instead of creating duplicate credits.
- Partial refunds remain separate records and do not erase the original charge.
- Competing retries must be protected by database constraints and transactions.
- No automatic financial changes to existing partner compensation rules.
- No outbound customer communication is triggered by historical reconciliation.

## Baseline findings

The authenticated Square developer console showed no production webhook subscription
for the CRM application. The scheduled GitHub payment-email workflow returned a 308
redirect as a successful run without executing its processor. The existing source has
payment links, atomic quote reconciliation, an API receipt table, and entry-ledger
reconciliation. These should be extended rather than replaced with a competing ledger.

Current credentials downloaded through Vercel are masked. Their presence is not proof
of authentication. The locally installed Supabase REST wrapper references a missing
secret file. The current Supabase CLI identity does not list the dedicated 805 project.
Use an authenticated 805 deployment or the correct database account for live work;
never substitute an MTS database.

The existing signed-in Chrome session does have access to the dedicated 805 project
and its SQL Editor. This supplies a possible reviewed migration path without changing
the CLI account or using the MTS database.

## Implementation design

Extend the existing payment receipt and bookkeeping tables. Add Square provider
objects for events, payment snapshots, refunds, disputes, payouts, payout entries,
sync runs, reviewed allocations, and bank matches. Retain stable provider IDs,
merchant, location, currency, environment, and timestamps on each imported object.

The webhook validates the signature, stores an event durably, and acknowledges it.
A bounded worker fetches the current provider object, validates company/location,
and updates the provider snapshot. Posting uses a database transaction with a unique
Square payment constraint and row locks. Notification work uses a separate outbox
so delivery failures cannot cause a second financial posting. Historical imports do
not enqueue customer notifications.

An authenticated recurring sync follows provider pagination and records its cursor,
coverage window, counts, errors, and completion time. It retries failed items without
abandoning independent transactions. Payment/refund updates and payout changes are
revisited; querying only newly created payments is insufficient for old refunds.
Overlapping jobs use a lease with expiry. A failed or truncated page never advances
the completed coverage watermark.

A review decision records the actor and independent matching evidence. Existing
manual/email entries can be linked after exact verification without adding a second
ledger credit. Conflicting amounts, currencies, company identities, or allocations
must remain exceptions. An import cannot revive a deleted or superseded job record.

Dashboard totals distinguish gross completed collections, completed refunds, known
processing fees, fees pending, payout adjustments, and externally verified bank
receipts. Each total links to its constituent records. Unassigned Square activity is
shown separately from confirmed 805 collections. Do not present a calculated residual
as an authoritative available Square balance.

Payout reconciliation uses the signed net amounts of its entries; fees are not
subtracted a second time. Store adjustments and chargebacks even when they do not
link to one payment. Verify full entry pagination before claiming a payout reconciles.
Bank matches retain the evidence source, statement date, amount, reference, actor,
and reconciliation time, including partial/combined matches and uniqueness checks.

The CRM Square navigation entry opens an authenticated workspace with overview,
payments, review, payouts, refunds/disputes, reconciliation, and connection health.
Use the existing CRM session and server-side role checks. Read-only users cannot
change allocations, bank matches, or company classifications. Owner-only decisions
include corrections and configuration. No browser receives provider credentials.

Payment requests retain the amount authorized when created and the exact ledger
target. A stale request cannot silently overcollect after another payment arrives.
Overpayments remain explicitly unallocated credit until reviewed. Split allocations
must sum to no more than the verified payment available for allocation.

## Verification cases

Completed and pending payments; identical duplicate delivery; concurrent delivery;
out-of-order updates; partial and split allocations; manual/email legacy matches;
conflicting targets; refunds and disputes; delayed fees; payout adjustments; bank
evidence; wrong merchant/location/currency; expired credentials; missed notifications;
pagination and backfill; unauthorized/read-only access; operational job preservation.

## Validation checkpoint

Typecheck, all 4,286 active tests, plus three owner-authorization tests, and production build passed before final release
review (28 pre-existing skipped tests). Production schema was inspected through the
805 Supabase SQL Editor. Customer names resolve through crm_jobs; crm_quotes has no
customer_name column. Migration validation includes split/duplicate credits,
existing-email links, excessive allocations, pending payments, public-role access,
bank evidence, one-time owner alerts, and out-of-order delivery status callbacks.

The active task model was read from its current local turn context: gpt-6-astra.
The remote repository independently replaced its obsolete Hermes rule during work.

## Production safety review

Reviewed September 19 before applying the migration. The migration adds empty
provider-evidence tables; it does not backfill or modify historical customer credits.
All new tables deny browser roles and use the existing server service role. Existing
CRM authentication and Mike-only write checks protect review actions. Signed Square
and Twilio callbacks reject invalid signatures. Tokens never enter client responses.

The existing credit table receives one guard trigger, preventing financial identity
changes only after a credit is explicitly reconciled. Allocation transactions lock
both the Square payment and target, enforce gross-payment and job-balance ceilings,
and link existing credits without increasing balances. No operation changes job
completion, issues a refund, charges a card, or transfers funds. History before the
activation cutoff cannot post a new credit or enqueue an owner text automatically.
SMS submission has an atomic claim and ambiguous outcomes require review, avoiding
retry texts. No synthetic production payment or test message will be sent.

Refunds remain evidence requiring review of the original credit. Payment-request
amount changes are flagged for replacement in Square; existing provider links are
not automatically disabled. Bank matches record supplied statement evidence, not
an assertion from Square that funds reached the bank. No production secret value
has been changed during implementation.

Production migration applied and read back successfully: all Square tables have RLS enabled; the 50 existing Square credits ($81,897.42) and seven email credits ($13,921.55) remain unchanged. Zero owner alerts were queued.

## Live verification

Commit 69733d783082e4ec640b442dc6d3fc407290e17f deployed to the 805 Vercel
project. The release gate passed 4,318 tests (28 skipped), typecheck, and build.
The authenticated /crm/square/ page loaded for 805shutters@gmail.com. Refresh from
Square succeeded and verified merchant ML8D19B62TKYQ / location L2ZQK8P58PJRM.
The first import linked three recent existing credits totaling $5,689.07, including
Mary Ann and Sinae, without adding new customer credits. The live health page confirms
SMS configuration is present. No new payment alert has been sent or delivered yet.

The public 805-one.vercel.app alias redirects to www.805shutters.com even with a
trailing slash. The recovery workflow now calls the canonical www URL directly and
requires a recognized JSON sync status, so redirects cannot masquerade as success.
The Square developer-console session expired during verification; its login page
is preserved for Mike to sign in. Webhook subscription setup still requires that
session. Initial historical payment and payout pagination subsequently completed; periodic rechecks continue.

## Recovery and UI follow-up

Production release 4703201e2a464206586e4e5972aa02f5529a7bdf passed the full
release gate and live verification. GitHub recovery runs 35452655387, 35452932462,
35453191938, and 35453288778 completed successfully against the canonical live
API. Payment imports have reached September 2026. Payout, refund, and dispute
history have completed their first passes. The dashboard now distinguishes an
ongoing recheck from missing initial history; previously completed coverage is
retained while older records are rechecked. The recovery workflow ends its initial
batch once every category has completed at least one pass without errors.

The Square login page remains the one provider-setup blocker. No webhook delivery
or real owner SMS has yet been observed, and no historical/test alerts were sent.

## Completed historical baseline

Authenticated live readback on September 19 at about 9 AM Pacific verified 278
payment objects and all 50 pre-existing Square credits linked by exact ID, totaling
$81,897.42, with no new customer credit and no matching errors. All 183 imported
payouts have complete entry breakdowns whose signed net totals balance. None is
claimed to match a bank statement without statement evidence. All four historical
resource categories completed their first pass through the initial 8:39 AM cutoff;
recent-payment recovery was current through 8:58 AM.

The Square location includes $420,091.06 gross completed collections and $13,704.32
known fees across its available history. These are location totals, not confirmed
805 revenue. 199 completed payments remain in assignment/review; historical
company/customer ownership must not be inferred from names or amounts. The seven
existing email credits retain their original values and need exact provider
evidence before linking. No refund records or pending payments were present in
this snapshot. No owner texts were queued for the historical import.
