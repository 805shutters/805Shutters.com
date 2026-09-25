# Native quote resend repair

A repeated Send could return an old successful receipt and show Sent without a new message. Business conflicts raised SQLSTATE 40001, causing PostgREST transaction retries and reservation timeouts.

## Behavior

- Completed deliveries expose **Send again**, with the saved recipients restored for staff review. Each explicit resend reserves a new immutable request and new provider attempt IDs against the same frozen contract.
- Duplicate clicks/retries reuse one request key. A second dialog based on an older delivery is rejected once another request is created. Pending requests resume; uncertain outcomes require receipt reconciliation.
- Historical acceptance returns `alreadySent`, never a new-send success. Success reports provider acceptance and the count of newly accepted recipients. Failure remains visible in the dialog.
- Permanent native delivery/acceptance conflicts use PT409. The application maps these to HTTP 409. Quote-send result/failure logs include quote identity for later investigation.
- Prices, contract tokens, grouped alternatives, signatures, prior receipts, and customer messages are preserved. Resends do not change the original technical-measure decision.

## Verification

- Full repository suite: 9,100 passing tests, 28 skipped at the initial full run; subsequent focused checks include grouped resends and the final UI corrections.
- Final focused coverage: 52 passing tests across provider orchestration, real PGlite migrations/transactions, and the mounted send dialog.
- Typecheck, production build, and public-site integrity checks passed.
- Local browser checks used the real component with a synthetic provider fixture at desktop, phone (390 × 844), and iPad (820 × 1180) sizes. Checked new recipient submission, failure remaining open/visible, and uncertain-send blocking.

## Release order and checks

1. Apply `20260925141722_native_quote_explicit_resends.sql` before deploying the application, so its batch filter exists.
2. Publish the application; confirm exact deployed commit and authenticated quote dialog.
3. Verify live capability, recipient preservation, and PT409 guards in a rolled-back database transaction without contacting providers.
4. Check PostgreSQL for any old retrying sessions. Only cancel a session positively matched to repetitive business-conflict logs; do not restart the project or terminate unrelated work.

A successful provider acceptance is distinct from mailbox delivery. No live customer email is required for these release checks, and none is automatically sent by this migration.
