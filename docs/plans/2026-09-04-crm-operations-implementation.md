# CRM operations implementation

Base: origin/main 317a52bc6cf44c99892ea1d9a0af39a1b3dff14d. Isolated worktree; canonical checkout preserved.

## Plan and acceptance
- [x] Verify current main and establish clean baseline: 344 test files / 2,812 tests passed; 20 skipped.
- [x] 1A: shared evidence-derived progress, installer outcomes, consistent queues, terminal conflicts, financial closeout separation, source health; no migration.
- [ ] 1B: database role enforcement, source completeness and integration-health reporting are implemented and verified. Gmail repair remains blocked on a secure 805 mailbox connection; no importer replay authorized.
- [x] 2: owned next actions and revisions, open service obligations, operational timeline with raw audit, separate future appointments, durable report history and independent submission/notification acknowledgement. Released and verified live.
- [x] 3 (released and verified live): exact purchased-line quantities, shipment/receipt child records, attributed vendor promise changes, service/visit relationships and closeout guard.
- [x] 4: reporting contracts, quote conversion, run-rate labeling, incomplete-data handling and remaining reporting-source pagination. Final release verification follows this commit.
- [x] Final local unit gate: 2,880 tests passed / 20 skipped; typecheck and production build passed. Isolated desktop checks use only synthetic records and mocked providers.
- [ ] Review intended diff, publish main through Vercel 805, identify deployment and verify authenticated queues without communications.

Constraints: preserve monetary authority, payout policy, desktop workspace, source history and no-measure branch. No historical cleanup, communications, vendor commitments or broad E2E against production.

## Production evidence (2026-09-05 UTC)
- Confirmed 805 database `evuxqsaucmvgyuvjpqlo` through the authenticated Supabase dashboard. Installer outcome columns exist; 77 current forms are sent, with no submitted outcomes. Partial-report acceptance is fixture-tested.
- Applied migration `20260905002131_enforce_805_sales_write_roles` and recorded it in `supabase_migrations.schema_migrations`. Verified 18 restrictive write policies over the six existing 805 sales tables. Existing account/quote scope and reads remain intact.
- Before application, rehearsed the migration in a rolled-back transaction with synthetic table rows and the real owner, salesperson, read-only and unrelated identities. Read/insert/update/delete assertions passed. No customer rows were changed.
- Profile RLS permits management only to service_role. Anonymous users have no grants or applicable policies on the six sales tables. Sales mutation security-definer RPCs inspected are not executable by authenticated or anonymous callers.
- Gmail production broker points to the MTS gmail-oauth-repair function. Verified deployed version 71 supports only auth-url and exchange; it cannot return access tokens. Removed action-name probing. A secure scoped token endpoint or direct 805 OAuth configuration is still required. No replay or external communication performed.
- Integration attempts now record separate success/failure evidence without tokens or email content. Unknown prior history remains explicit. Remaining secondary financial payment/allocation ledgers are paginated; source failures are exposed.
- The 1A release intentionally introduces no task, receipt, service or event schema. The subsequent releases add the structures listed below.

## Second implementation slice
- Applied `20260905011000_crm_owned_actions_and_report_history` after a rolled-back rehearsal against the actual schema. Existing tasks are extended; no historical actions or reports were fabricated.
- In-memory PostgreSQL tests prove atomic task/event saves, optimistic concurrency, request replay safety, 26 preserved report revisions, service-task deduplication, append-only history and direct-role restrictions.
- A later complete installer report keeps an unresolved office service task open. Installer submission conflicts preserve current edits; provider notification failure no longer misreports the saved report as unsaved.
- New office actions default to Mike. Existing unassigned records retain their visible unassigned state. Due-date changes retain before, after, reason and actor.
- Main advanced with an independent technical-measure task during this work; preserve and rebase onto its latest commits before publishing.

- Phase 2 pushed SHA `da269427bd29ce336744a502adf4999205bff19f`; 2,864 tests and 12 isolated browser checks pass. Production deployment `dpl_ACbWUTZpnBTTgjbx3iagZgLrvL2v` is READY, CI 33936214586 passed, both aliases expose that deployment, and authenticated queues retain 306 active records / 40 attention / $115,646.71 balance.

## Third implementation slice
- Applied migration `20260905020000_crm_fulfillment_and_service_visits` after rollback rehearsal. Four RLS-protected child tables; authenticated and anonymous RPC writes denied. Zero historical product records created.
- Purchased scope is read from signed selected openings and revalidated on dashboard refresh; product/quantity changes invalidate earlier readiness. No prices or payment authority copied.
- Shipment, physical receipt, damage, usable-product returns and append-only corrections remain distinct. Received remakes satisfy the original opening without double-counting missing units.
- Visits retain exact appointment, report revision, original visit, affected openings and owned service action. A return visit cannot reuse an earlier completed report.
- Normal manual closeout validates all applicable orders; owner-only documented exceptions preserve visible unresolved obligations.
- 2,872 unit tests passed, 20 skipped; typecheck/build passed. 13 isolated desktop checks passed before final server-only hardening; no production communications or business record mutations.

- Phase 3 pushed SHA `1edd50a45f484c67ea8bb76096a914931929cd9f`; CI 33937810965 passed; production deployment `dpl_9Yw9is92TSso44cuqGGMNF7puo4x` is READY and tied to that SHA. Both aliases expose that deployment. Authenticated tracking shows 306 active / 40 attention / 329 total and $117,883.06, matching its header. A concurrent real sale changed the financial snapshot since Phase 2; this is not a claim that amounts stayed constant across time.

## Fourth implementation slice
- New Operations Reports view supplies shared record arrays, stable IDs, explicit units, Pacific business dates, cohort filters, snapshot time, evidence and incomplete/unavailable states. Customer conversion remains separately labeled; annualized booked sales is a run-rate estimate.
- Pipeline uses the latest offered version with stable opportunity grouping. Ambiguous legacy grouping and missing sold dates receive review cohorts. Quote conversion uses first-sent opportunities rather than customer history.
- Collected receipts, refunds, credits and net collection are separate. Receivables classify due/future amounts only when an exact single-order payment schedule reconciles to the ledger. Missing terms stay unknown. Customer invoices remain unavailable without an authoritative invoice source; margins never claim reconciliation from incomplete costs.
- Backlog, actual/unknown stage aging, physical readiness, missing documents, vendor delays/missing promises, service, cancellation obligations and daily owned actions share progress and evidence. Failed secondary financial sources visibly withhold affected financial conclusions.
- Remaining report/activity/calendar/vendor/measure sources are paginated. Report calculations and rendering are extracted into focused modules; a 1,000-opportunity fixture verifies additive totals, stable IDs and a five-second calculation budget.
- Return visits can resolve the affected portion of an original partial visit while retaining original history and unrelated unresolved openings.
- Final audit removed payment-driven closure from legacy quote status mapping, manual bookkeeping balance acknowledgement and the atomic Square reconciliation RPC, in addition to the earlier customer-closeout repair. Explicit manual closeout validates remaining obligations.
- Applied `20260905023000_separate_square_settlement_from_job_closeout` after rollback rehearsal against the exact deployed function. Only its obsolete job-close block changed; receipt/idempotency implementation and restricted grants remain. Production verification: no parent-job update, authenticated/anonymous execution both denied, migration history recorded. No actual payment callbacks or historical acknowledgements were replayed.
- PostgreSQL regression proves a paid first quote leaves its parent job and second order actionable, duplicate callback creates one receipt/audit, unsigned receipt does not mark a quote paid, and amount/link mismatch still fails.

## Remaining external dependency
Gmail scheduled recovery requires a secure 805-scoped token broker or direct 805 OAuth connection. The configured MTS setup endpoint cannot return access tokens and must not become an unauthenticated token endpoint. Last-success unknown/failure states are explicit. A narrow applying replay still requires separate authorization and exact effect verification.
