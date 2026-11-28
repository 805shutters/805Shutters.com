# Mercury webhook exact-URL repair — November 27, 2026

Target: `https://www.805shutters.com/api/webhooks/mercury` (no trailing slash).

## Plan and scope

- Complete: reproduced public POST 308 with Location `/api/webhooks/mercury/`; isolated current main `0e8af5af` from the dirty canonical checkout.
- Complete: traced the custom `/:notfile` redirect in `next.config.mjs`, which runs before proxy and the handler. Next's automatic slash redirect was already disabled; the explicit replacement rule caused this redirect. Vercel serves this application, not a local nginx process.
- Complete: exempt only this exact pathname in that rule; proxy retains 308 for non-POST methods, including GET/HEAD, with query preservation. Neighbor routes retain their existing rules.
- Complete: authenticate raw bytes before JSON parsing or database access; accept the requested raw-body hex HMAC-SHA256 using a constant-time comparison. Preserve Mercury's documented `t=<timestamp>,v1=<hex>` format and its five-minute timestamp check for existing deliveries.
- Complete: log only event type and transaction ID on acceptance; no body, customer fields, headers, signature or secret logging. Keep the existing transaction-keyed bank-credit uniqueness and deterministic payment ID. Replays with different event IDs cannot create a second payment.
- Complete: focused route/auth/proxy tests and existing redirect comparisons pass; typecheck and full unit suite pass (937 files, 11,418 tests; 6 files/37 tests skipped).
- Complete: production build and local built-server curl smoke: unsigned 401 (24 ms), bad signature 401 (5 ms), signed 200 (3 ms), signed replay 200 (2 ms), all without redirects. GET Mercury remains 308 with query intact; Stripe, similarly named Mercury paths and public page slash behavior unchanged.
- Pending: scoped publication and exact production curl verification.
- Blocker: production project environment inventory contains no `MERCURY_WEBHOOK_SECRET`. Mike was asked to supply the existing endpoint secret securely or configure the 805 production environment. No replacement secret was invented or printed.

## Behavior and safety review

An unsigned request returns 401 without reading its body. A bad signature returns 401 before parsing, logging, database or SMS activity. A configured signature is needed for successful verification; a signed request with missing server configuration fails closed with 503. Malformed authenticated JSON remains 400. A valid unsupported event is acknowledged immediately without database access. Existing transaction reconciliation remains synchronous and retains retryable 503 responses if durable processing fails; this change does not acknowledge work that could be lost. No new queue, financial policy, schema migration or unrelated route is introduced.

Raw-body hex signatures have no timestamp; durable identity/payment deduplication protects against repeated effects. Timestamped provider signatures continue rejecting stale deliveries. Verify both formats with the real configured endpoint before treating bank delivery as operational. Mercury's provider format is documented at https://docs.mercury.com/reference/webhooks.

The safe curl smoke in `scripts/verify-mercury-webhook.mjs` uses a non-transaction `webhook.verification` event. It proves 401/401/200/200, no redirects, and the handler's response, without inserting a payment, bank credit or event or sending messages. It reads the secret only from its environment, passes the signature to curl through stdin, prints only statuses/timings, and removes its private temporary files. Unit tests separately prove transaction idempotency and invalid-signature absence of side effects.

Publication is authorized by Mike's request to fix and reload the live route. On this Vercel host, a production deployment replaces the serving function; no unrelated local process is restarted. No bot-plan work is part of this repair.
