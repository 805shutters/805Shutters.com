# Payables job cards — local implementation

## Scope

Approved option 2 replaces the active Payables workspace with black/pewter job cards, aligned circular controls, customer/quote search, three account summaries, the existing buyout ledger, and owner payment history.

The new Payables projection computes 10% buyout from contract total, deducts COGS and installation, and splits positive remaining profit equally between Mike and Jessica regardless of seller. Odd cents are conserved: Jessica receives the residual cent. Losses remain visible as negative profit with no owner payout. Existing financial rows are not rewritten. Other accounting costs remain visible in a disclosure and are not deducted by the requested split formula.

A paid-and-closed job is automatically ready. A staff correction records a reason and actor in source metadata without altering customer payments. Payout checks indicate recorded payments or applied advances; readiness alone never records a payout. Mike's existing write permission is preserved.

Existing payment/advance history and exact allocations are reused. Historical payments above the recalculated share remain account credits. Partial payments are supported only in the new equal-owner payment mode. Existing payment callers retain their original full-payment behavior. The new record-only mode sends no receipt email or transfer.

## Completed checks

- [x] Traced `/crm/payables` → `CrmApp` payments tab → new `PayablesWorkspace`.
- [x] TypeScript: `npm run typecheck` passed.
- [x] Focused owner-calculation, backend partial-payment, readiness metadata/concurrency/permission tests: 17 passed.
- [x] Full current-main suite: 4,243 passed; 28 skipped.
- [x] Source-row immutability; exact allocations; historical overpayments and advances; odd-cent conservation; invalid/excess amounts.
- [x] Readiness PATCH merges metadata only, guards exact source/id and fresh `updated_at`, rejects stale correction revisions and non-admin callers, audits, and reloads.
- [x] Browser sample fixture renders the actual React component: partial → full payment → green check; buyout recording; manual readiness; advance credit; search; failed-save feedback; read-only controls.
- [x] Visual checks at 1440px and 390px: aligned desktop circles, responsive phone editor, no document horizontal overflow, no browser console errors.
- [x] Diff whitespace check for modified existing source files passed.

## Integration with current main

The release was reconstructed on current `origin/main` in an isolated checkout. The canonical workspace's unrelated changes were left untouched. The current buyout payment method, stable request ID, atomic RPC, duplicate protection, and reconciliation safeguards remain active. The new combined owner view is limited to Mike's existing financial access; restricted users retain their existing views, and the new ledger is omitted from their API responses.

Existing advances and excess payments are applied to open shares in the read-only projection, after exact historical allocations. A regression test confirms that a historical payout that already applied an advance does not apply it twice.

Final release validation: `npm run typecheck`, `npm test` (4,243 passed; 28 skipped), and `npm run build` passed. The two failures observed in the older canonical checkout are absent on current main. The integrated sample browser check confirmed a $500 advance plus a $1,500 payment settles one $2,000 share.

## Release boundary

No production financial records or migrations were changed during implementation or verification. Publication is to Git main; deployment and authenticated production writes are separate from the local validation above.

Preview: run `node_modules/.bin/vite --config e2e/norman-fall.vite.mjs --port 4214`, then open `/e2e/fixtures/payables.html`. Preview state is sample-only and resets on reload.
