# Contract signing reliability review

## Findings and fixes

The public contract uses `CustomerContractDocument` -> `QuoteSelection` -> `SignQuote`, posting to `/api/quote/[token]/accept`, then `acceptPublicQuote`. Native quotes and partial purchases use existing database acceptance functions; legacy full purchases use a conditional update.

- Empty database claims, native RPC results, and uniqueness conflicts previously could return `alreadySigned: true` without evidence that this contract had a signature. These paths now verify the exact quote's saved timestamp and signature. A different accepted option remains a conflict.
- The browser previously treated any successful HTTP response as a completed signature, even with malformed JSON. It now requires the expected success response, or an uncached read-only lookup confirming a persisted signature after an interrupted response.
- Interrupted requests retain the customer's typed name and selections. A synchronous submission latch prevents duplicate clicks; pending requests freeze name, consent, and selection controls.
- Item-price requests could finish out of order or fail while leaving a stale total eligible for signing. Requests now abort on selection changes, reject malformed results, and block signing/payment until the selected total is verified. A changed total or selection resets consent.
- The public endpoint requires a name, signature, positive finite acknowledged total, and valid selection shape. Archived, lost, and superseded contracts are rejected before a new signature claim.
- A failure after a signature is saved now confirms durable signature evidence before responding, then schedules one bounded idempotent follow-up attempt. Existing saved signature/name and notification deduplication remain authoritative.

## Safety review

No database migration, permission change, credential change, historical signature creation, payment charge, customer notification, or contract acceptance is part of this release verification. Payment collection remains separate from signature acceptance; paying a deposit does not manufacture consent. Existing payment amounts and provider calls are unchanged; controls pause while selected totals or signature requests are pending.

A sold timestamp without a saved signature is not sufficient evidence for API confirmation. Such inconsistent historical records require review rather than creating a signature from the printed name. Existing customer-page projections for historical manually sold records were not redesigned here.

The follow-up attempt is bounded by the server request lifetime; it is not a new durable queue or a guarantee of SMS/email delivery. Existing delivery queues and provider records still determine actual downstream delivery. Legacy full acceptance retains the existing amount consent guard; this release does not introduce a revision fingerprint for same-price edits.

## Verification

- Full Vitest suite: 8,964 passed; 28 opted-out/skipped tests, across 700 passing files and 5 skipped files, on the initial reviewed base.
- Typecheck and optimized Next.js build passed.
- 12 Playwright browser checks passed at 390px, 820px, and 1440px, using the real contract document/components with synthetic quote data and intercepted API responses. Covered consent, duplicate clicks, pending controls, interrupted requests, recovery, stale subset totals, failed total lookup, and renewed consent. These are Chromium viewport checks, not physical-device Safari tests.
- Existing local database tests cover native snapshot acceptance; new API/helper/claim regressions cover failure confirmation and exact-contract signature evidence.
- Live verification is read-only. No real customer's contract is used for a test signature or payment. Successful synthetic tests are not proof of receipt by a real SMS recipient.

To repeat the isolated browser checks, start `npx vite --config e2e/contract-signing.vite.mjs`, then run `npx playwright test e2e/contract-signing.local.spec.ts`.

## Rollback and measurement

This is an application-only change. Roll back by reverting this release commit on main and deploying through the normal 805 release script; persisted signatures remain in the database. Investigate `[contract-signing]` follow-up/confirmation errors, reconcile signed quotes against sold state and notification records, and check the actual provider delivery state when an alert is reported missing. Do not infer delivery from HTTP success or a saved sale alone.
