# Quoting-only rollback — 2026-11-23

## Authority and scope
Mike explicitly authorized immediate quoting-only reversion and live release. Preserve unrelated CRM performance, public website, payments, signed contracts, customer records and dirty checkouts. No customer sends or payments as tests.

## Source change
Based on production ce7c250b. Restore the exact pre-cutover catalog cost calculations and Norman policy from 3c0851a8^1 (identical to pre-window 58e22944 for these paths). Only two runtime files change: quote-v2/engine.ts and quote-v2/norman-dealer-policy.ts. The previous 0.33 standard and 0.297 alternate policy come from the existing account-specific portal fixture; no new manufacturer price is supplied. This restores historical behavior, not a fresh manufacturer-rate reconciliation. Restore prior golden/assertion coverage; remove two superseded tests demanding the now-reverted block, retain switch-on tests and add receipt-preservation coverage. Retain subsequent Bali profile fixes, restoring only their old price assertions.

The full quoting rollout also added queue/receipt/front-door schema and readers. Removing these is unnecessary and risks existing post-Friday records. Keep that additive schema, historical receipts, manual overrides, charges, quote IDs and application routes. Disable the four mandatory-live runtime switches instead. No down migration, backfill, customer update, speculative price or repricing job is part of this release.

## Verification
- Focused quote engine/catalog/save/send/locks/database checks: 3,973 passed; two obsolete Bali blocking assertions identified and restored.
- Full run: 11,266 passed, nine failures in a restored supplier test whose API gained chargeSettings. Kept the current supplier test/API unchanged; corrected focused run 48/48 passed, including database preservation and Bali profile assertions. Final full release run pending.
- Production build passed. Initial typecheck exposed the same supplier-test signature issue; corrected in the final build.
- Contract browser regressions: 4/4 passed at responsive/print layouts.
- Read-only copies of four recent quotes evaluated offline without mutations. The affected ten-line draft yields seven authoritative Norman faux-wood prices. Three lines remain blocked for missing mount/motor compatibility, unsupported Onyx source, or absent program. Two live-price pilots lack catalog programs; their existing receipts/prices remain saved. A sent five-line contract is preserved, not repriced. Raw customer rows are not committed.

## Production procedure
1. Publish this narrow commit to main; run npm run deploy:vercel; verify production domain resolves to the exact SHA.
2. On dedicated805 evuxqsaucmvgyuvjpqlo only, transactionally update crm_live_lookup_switch for norman, onyx, sundance, lotus to enabled=false with accurate rollback actor/time. Read back all four. Before release, all were true: Norman enabled 2026-11-21T02:50:37Z, others 2026-11-21T20:27:06Z. No other table changes.
3. Verify authenticated CRM loads existing quotes, safe production pricing preview, and saved contract preservation. Do not open real draft editors if that would automatically mutate pricing. Use internal safe verification for persistence if needed.
4. If reverting this release is necessary, first review current quotes; restore the exact two runtime files from ce7c250b and prior four switch values. Never delete receipts or restore database snapshots.

## State
Registered worktree /Users/michaelshepard/.codex/worktrees/quote-pricing-rollback/805. Canonical checkout remains untouched. Source reviewed; publishing in progress.
