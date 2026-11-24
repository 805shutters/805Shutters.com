# Signed-contract staff SMS recovery

The signing transaction inserts a quote-level ticket in `crm_signed_sms_retry` when a genuine signature first becomes durable. Existing immediate staff alerts remain active. The separate `/api/cron/signed-quote-sms/` worker runs every two minutes, with the first recovery eligible two minutes after enqueueing. It reads the signed quote directly without rebuilding products or technical-measure forms.

The worker uses the same staff recipients, message format, sender routing and atomic per-recipient claims as the immediate alert. Provider-accepted/delivered messages are skipped. Known failures retry with 5, 10, 20, 40 and 60 minute backoff; six unsuccessful worker attempts require review. Provider calls have a 15-second bound. Unknown outcomes, stale in-progress sends, invalid destinations and carrier rejections are held for reconciliation, never blindly replayed. A worker lease can recover after five minutes, while the per-recipient record still prevents duplicate sends.

Suppressed, historical-import, archived/lost and unsigned records are excluded. Controlled `notify:false` signing persists `sold_sms_suppressed` before committing the signature. There is no bulk historical backfill and no customer-message replay.

## Operations

The authenticated cron endpoint supports `?dryRun=1` for counts without claiming or sending. A blocked queue entry returns an unhealthy status. Check `crm_signed_sms_retry.last_error`, the matching `crm_sold_quote_sms_notifications` rows, and Twilio delivery evidence before any manual recovery. Accepted means provider acceptance; it does not prove handset delivery.

To recover a specific eligible historical miss after reviewing recipient/provider evidence, call the service-only `enqueue_signed_sms_retry(quote_id)` RPC. It does not modify the contract and is quote-idempotent. Do not reset accepted, unknown or in-progress per-recipient records to force a retry.

Validation covers transactional enqueue/rollback, notification suppression, import exclusion, lease recovery, public-role denial, bounded retry, ambiguous-send holds, and cron authorization. All queue access is service role only; the trigger and worker RPCs are unavailable to public roles.
