# Payment Hub

User selected design A: colored method tags with line icons. Each receipt also shows its explicit Deposit / Balance / Progress / Full payment purpose. Missing evidence remains Unspecified.

## Work plan
- [x] Inspect production path and existing ledger; preserve unrelated canonical work.
- [x] Confirm design and Zelle + Venmo scope.
- [x] Combine Square and ledger receipts by exact IDs, newest first; add method and purpose filters.
- [x] Record manual receipts and track checks through receipt, deposit, clearance, return with owner audit.
- [x] Regression tests, additional financial safety review, desktop/tablet preview.
- [x] Main release gate and authenticated production verification (see verification below).

## Financial invariants
- Provider imports and linked ledger credits are one displayed payment, never deduplicated by matching names or amounts.
- Payment purpose comes from an explicit ledger purpose, known payment label, exact Square order request, or the exact structured checkout note. It is never inferred from payment size or position.
- Check receipt credits the job but does not claim bank clearance. A confirmed returned check removes its credit in the same atomic row update that preserves face value and audit history.
- Historical checks start with unverified clearance. No historical financial state is silently rewritten.
- No outgoing customer messages, real test payments, refunds, transfers, or deposits are performed by this implementation.

## Additional financial safety review
+- New writes are authenticated owner-only; actor identity comes from the CRM session.
+- Receipt inserts use the existing primary key plus unique external source/reference constraint. Retries compare immutable receipt identity; conflicting details fail closed.
+- Check updates compare the current row version and atomically store credit, status and evidence in one update. Return retries cannot remove credit twice.
+- Generic ledger edits/deletes cannot erase a managed check history, and version checks prevent a stale editor from overwriting a concurrent check update.
+- No migration or new provider credentials are required. No production receipt or check state was changed during testing.
+- Focused tests cover purpose evidence, exact deduplication, mixed payment methods, form controls, return balance math, audit history, stale updates, idempotency and owner authorization. Desktop, 820px tablet and 390px phone previews were inspected.
+- Apple Pay classification uses Square wallet evidence or our exact structured checkout note; card entry method alone does not prove Apple Pay. Reference: https://developer.squareup.com/reference/square/objects/CardPaymentDetails

## Production verification
Main implementation: 16a3e768, deployed to the 805 Vercel project. The authenticated `/crm/payment-hub/` rendered 415 records, with 34 checks, 4 cash, 20 Zelle, 1 Venmo, 6 Apple Pay and 306 Square/Card classifications at verification time (44 other records). Method and Balance filters worked; check details kept historical clearance unverified. No production financial changes were submitted.

Live verification exposed older explicit Deposit adjustment / Balance payment adjustment records. Their purpose is now read from the existing label or `adjustmentKind`; negative ledger corrections stay visibly distinct from received payments.
