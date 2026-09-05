# CRM operations implementation

Base: origin/main 317a52bc6cf44c99892ea1d9a0af39a1b3dff14d. Isolated worktree; canonical checkout preserved.

## Plan and acceptance
- [x] Verify current main and establish clean baseline: 344 test files / 2,812 tests passed; 20 skipped.
- [x] 1A: shared evidence-derived progress, installer outcomes, consistent queues, terminal conflicts, financial closeout separation, source health; no migration.
- [ ] 1B: supported Gmail broker contract, integration health, complete financial sources, database role enforcement. Production broker and database access must be verified; no importer replay authorized.
- [ ] 2: owned next actions, attention queue, operational timeline and durable revisions.
- [ ] 3: exact order/quantity receipt and service/visit records.
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
