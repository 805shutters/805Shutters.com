# CRM operations implementation

Base: origin/main 317a52bc6cf44c99892ea1d9a0af39a1b3dff14d. Isolated worktree; canonical checkout preserved.

## Plan and acceptance
- [x] Verify current main and establish clean baseline: 344 test files / 2,812 tests passed; 20 skipped.
- [x] 1A: shared evidence-derived progress, installer outcomes, consistent queues, terminal conflicts, financial closeout separation, source health; no migration.
- [ ] 1B: supported Gmail broker contract, integration health, complete financial sources, database role enforcement. Production broker and database access must be verified; no importer replay authorized.
- [x] 2: owned next actions and revisions, open service obligations, operational timeline with raw audit, separate future appointments, durable report history and independent submission/notification acknowledgement. Local tests pass; release verification pending.
- [x] 3 (implemented; release pending): exact purchased-line quantities, shipment/receipt child records, attributed vendor promise changes, service/visit relationships and closeout guard.
- [ ] 4: reporting contracts, quote conversion, run-rate labeling, incomplete-data handling.
- [x] Local regression gates: 2,829 tests passed / 20 skipped; typecheck and production build passed; 11 isolated browser checks passed. Repeat affected checks after further changes.
- [ ] Review intended diff, publish main through Vercel 805, identify deployment and verify authenticated queues without communications.

Constraints: preserve monetary authority, payout policy, desktop workspace, source history and no-measure branch. No historical cleanup, communications, vendor commitments or broad E2E against production.

## Production evidence (2026-09-05 UTC)
- Confirmed 805 database `evuxqsaucmvgyuvjpqlo` through the authenticated Supabase dashboard. Installer outcome columns exist; 77 current forms are sent, with no submitted outcomes. Partial-report acceptance is fixture-tested.
- Applied migration `20260905002131_enforce_805_sales_write_roles` and recorded it in `supabase_migrations.schema_migrations`. Verified 18 restrictive write policies over the six existing 805 sales tables. Existing account/quote scope and reads remain intact.
- Before application, rehearsed the migration in a rolled-back transaction with synthetic table rows and the real owner, salesperson, read-only and unrelated identities. Read/insert/update/delete assertions passed. No customer rows were changed.
- Profile RLS permits management only to service_role. Anonymous users have no grants or applicable policies on the six sales tables. Sales mutation security-definer RPCs inspected are not executable by authenticated or anonymous callers.
- Gmail production broker points to the MTS gmail-oauth-repair function. Verified deployed version 71 supports only auth-url and exchange; it cannot return access tokens. Removed action-name probing. A secure scoped token endpoint or direct 805 OAuth configuration is still required. No replay or external communication performed.
- Integration attempts now record separate success/failure evidence without tokens or email content. Unknown prior history remains explicit. Remaining secondary financial payment/allocation ledgers are paginated; source failures are exposed.
- The 1A release intentionally introduces no task, receipt, service or event schema. Those later phases remain pending as listed above.

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
