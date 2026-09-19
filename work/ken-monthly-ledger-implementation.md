# Ken monthly buyout correction

Implemented in the isolated `codex/ken-monthly-ledger` branch, based on origin/main e65b1b59970158bba7b1d3c8d96907980f910fc7. Canonical checkout and live financial records were not modified.

## Reconciliation

The approved CRM baseline is July 4 $3,714.70 + August 2 $5,454.44 + September 1 $4,160.53 = $13,329.67. Tests reproduce the $3,778 historical checkbox overlap, including the $63.30 August allocation. Runtime reconciliation uses exact persisted item/quote/bookkeeping identities and allocation amounts, never customer names or a hardcoded total.

Confirmed duplicate checkbox entries remain visible with their original amounts, linked batch IDs and an excluded status. Ambiguous entries remain flagged for review. No inferred account credit can allocate historical cash to a new job. The synthetic $63.30 adjustment is excluded from the reconciled projection: persisted cash records are the only payment source.

Both payables response models and the buyout summary share the same Ken projection. Mike and Jessica's existing calculations and advances are unchanged.

## Monthly readiness and persistence

Automatic readiness requires full customer payment, completion evidence and closed job status. Eligibility is the latest evidenced payment/completion/closure date. Missing historical dates remain flagged instead of using sale dates or updated_at. Exact historical allocations stay frozen even when jobs reopen. New unpaid eligible amounts carry to the next first-of-month ledger.

Timestamp cutoffs are strict; date-only evidence cannot establish same-day ordering. A separate Ken readiness correction requires a reason, an audit event and an optimistic revision check. It creates no cash payment and does not modify owner readiness.

New batches retain cutoff/due date/eligibility snapshots in existing JSON metadata. Allocation metadata retains full eligibility timestamps, despite the older date-only closed_at column. Existing atomic RPC idempotency and raw allocation concurrency checks remain active.

Migration `20260919010000_capture_payable_job_closure_time.sql` adds forward-only closure timestamps to job status transitions. No historical backfill or payment deletion. Application deployment and this migration are required before the complete production behavior is active.

## Verification

- Full pre-final regression suite: 477 files passed, 5 skipped; 4,253 tests passed, 28 skipped.
- Final focused financial/readiness/database suite: 29 tests passed.
- PGlite executes the actual atomic payment RPC: partial payment, idempotent replay, stale-write rejection, metadata reload and closure trigger.
- TypeScript passed.
- Production build passed; final rebuild performed after final changes.
- Chromium local fixture verifies partial payment, payment history, Ken-only readiness correction and 390px mobile overflow.

Preview uses explicitly labeled synthetic data: http://127.0.0.1:4215/e2e/fixtures/payables.html
No production write, email, transfer, push or deployment was performed. Exact live unmatched/date-review counts must be checked on the authenticated production response after release; local tests do not establish those counts.
