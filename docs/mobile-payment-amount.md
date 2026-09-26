# Mobile full and partial payment collection

Implemented locally on `codex/mobile-payment-amount`, based on `origin/main` at `dec751ccdc5ae3d8b1a79e9e2148e8bbd42bd68a`.

The mobile customer payments screen previously chose `dueType` automatically. With a $1,602.40 contract and $601.20 recorded, a $200 deposit shortfall was selected instead of the $1,001.20 outstanding balance. The existing balance-only service excluded that deposit shortfall as well.

The customer detail and featured payment cards now offer **Collect full balance** and **Collect partial amount**. Both open the existing review dialog with text/email delivery. Full uses the entire outstanding ledger balance. Partial accepts a manually entered dollar amount and shows the requested first payment and the remainder for later. For example, $400 now leaves $601.20 after that payment is recorded. Staff can return and choose full or partial for the remaining balance.

Only the current requested amount receives a Square link. Sending does not record either payment, create an automatic charge, or change the contract/deposit schedule. The remainder is the unpaid ledger balance, not a second simultaneously payable link or a dated installment/autopay plan. Existing Square receipt reconciliation records each actual payment separately. The send activity records the collection mode, starting outstanding amount, requested amount, and remaining amount after payment.

## Changed paths

- `src/components/crm/MobileCustomersApp.tsx` and its CSS module: buttons, amount entry, split review, guarded submit, and frozen retry inputs.
- `src/app/api/crm/mobile/customers/handler.ts`: forwards the selected collection mode/amount, reserves the exact requested amount, and rejects changed amounts on reused send keys.
- `src/lib/crm/square-payment-links.ts`: reads all payment/credit ledger pages, validates the reviewed outstanding balance, creates only the selected amount, and preserves legacy deposit/balance callers.
- Focused UI, API, replay, and Square service regression tests; a synthetic local Vite browser fixture.

## Verification

- 96 tests passed across seven focused test files.
- `npm run typecheck` passed.
- `npm run build` passed, including the mobile customer route.
- `git diff --check` passed.
- Browser fixture checked at 390 × 844, 320 × 740, and 1280 × 900. Reviewed list/detail screens and full/partial dialogs, input validation, email switching, review scrolling, and synthetic submission. The 320px screen has no horizontal overflow. No browser errors were reported.
- Browser submission evidence: full/text requested 100120 cents; partial/email requested 40000 cents with 60120 cents left after payment. Service tests separately verify a subsequent 60120-cent full request after the first payment is recorded.
- Screenshots are in `output/mobile-payment-amount/`. Run the fixture with `npx vite --config e2e/mobile-payment-amount.vite.mjs`, then open `/e2e/fixtures/mobile-payment-amount.html` on port 4287.

No production records were changed, payment links created, customer messages sent, or charges made. Not pushed or deployed; production behavior has not been verified. The original `/Users/michaelshepard/Documents/805` working-tree changes were preserved.
