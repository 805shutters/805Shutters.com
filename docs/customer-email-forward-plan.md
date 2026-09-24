# Forward customer email delivery

Scope: thank-you with signed contract; paid-in-full receipt and warranty email.
No historical catch-up emails or texts. Existing accepted records remain evidence only.

- [x] Audit current sending paths and identify missing durable closeout queue.
- [x] Capture new paid-in-full transitions atomically, including Square and payment plans.
- [x] Reuse durable signed-contract worker for both kinds; freeze payload and prevent duplicates.
- [x] Track provider delivery separately from acceptance; expose job status and operational alerts.
- [x] Test forward cutoff, no catch-up, attachment content, retries, concurrency and auth.
- [ ] Safety-review migration, publish, activate cutoff, verify production without customer test sends.

Activation is a one-time explicit database operation after deployment. It excludes all already-paid scopes and prevents all pre-cutoff queued messages from being claimed. No backfill or bulk-resend action is provided.

## Safety review

- The migration does not send email or SMS, insert historical queue records, alter payment amounts, or change payment allocation behavior.
- New settings and exclusions use RLS and service-role access only. Queue claim, activation and reconciliation functions deny public/anonymous/customer execution.
- Activation locks the financial tables while recording an exclusion baseline and setting a single cutoff. Repeating activation retains the original cutoff.
- Existing accepted email evidence is preserved. Pre-cutoff pending/retry records cannot be claimed. Accepted messages are never resent based on delivery status.
- Payment receipts use a unique financial scope, a frozen recipient/content snapshot, and the existing leased worker. Uncertain sends stop before the provider's 24-hour idempotency limit.
- Delivery checks are provider GET requests. The independent GitHub watchdog can only inspect health; its credential cannot invoke sending.
- Rollback: disable the customer-email cron/worker while retaining queue and acceptance evidence. Do not restore the legacy direct sender or replay old records. Repair and review any new blocked item individually.

## Verification and rollout

Database regression coverage includes paused operation, activation baseline, new final payments, payment reversals, missing recipients, duplicate/overlapping claims, historical retries, reconciliation and permissions. Worker tests cover frozen receipt PDF payloads and signed contracts. Full typecheck, test and build gates run before publication.

Publish code, apply the paused migration, run the read-only provider readiness check, then activate the cutoff. Verify the automatic cron heartbeat, independent watchdog, and authenticated CRM status. Do not generate a real customer event to test. Future real events remain the final production proof of individual message delivery.

Local validation: typecheck passed; 707 test files / 9,013 tests passed (5 files / 28 tests skipped); production build passed.
