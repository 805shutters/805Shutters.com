# Email processing repair — September 24, 2026

- [x] Audit payment, order, installation invoice, and shipping paths against production.
- [x] Isolate current origin/main from unrelated working changes.
- [x] Repair PDF extraction, invoice matching, diagnostics, and retry behavior.
- [x] Repair order-to-product matching and visible Ordered state.
- [x] Add durable shipment intake and exact product/date evidence handling.
- [x] Verify payment closure and later actual-cost updates with regression coverage.
- [ ] Run full tests, typecheck, build; review and publish focused changes.
- [ ] Reconcile unresolved records with source evidence and deduplication.
- [ ] Verify live desktop/mobile status and profit; record remaining evidence blockers.

Authority: Mike approved the complete repair/deploy/reconcile plan with “go.” No customer/vendor messages or financial transactions are included. Ambiguous matches stay in a review ledger.

Validation: typecheck passed; 9,028 tests passed (28 skipped); production build passed. Additional financial review confirmed cost-only writes, exact sale linkage, preserved revenue/status, compare-and-set updates, and duplicate protection. Brian, Ashley, and Greg each have two active allocations with unchanged COGS; before/after evidence is in email-processing-reconciliation.json.
