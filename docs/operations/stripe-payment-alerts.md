# Stripe payment staff texts

Each verified live CRM Stripe allocation transactionally creates one `crm_stripe_alerts` row, unique by account and PaymentIntent. Unpaid/test checkouts do not generate a receipt alert.

The independent `/api/cron/stripe-payment-alerts/` worker runs every two minutes, authenticated by `CRON_SECRET`. Finance reconciliation and webhook ingestion remain unchanged; an already-recorded payment alert does not wait for that work.

Production requires `STRIPE_OWNER_ALERTS_ENABLED=true`, `STRIPE_PAYMENT_ALERT_TO` set to the owner-confirmed receiving cell, live Stripe configuration, and the existing Twilio credentials. The shared owner-alert sender is retained. Missing recipient configuration or sender/recipient equality stops delivery with a 503 response. Preview is not enabled.

Messages include payment amount/type, exact linked quote customer name/address/phone (job fallback), and quote number when available. Missing contact details are explicitly marked Not recorded. No card details, customer SMS, or attachments are sent.

The worker claims each queued alert atomically before sending. Accepted or delivered rows are never selected again; ambiguous outcomes remain held for review rather than risking duplicate texts. Pre-send lookup failures leave the alert queued for a later scheduled attempt. Provider rejection/unknown/sending states require investigation, not a blind reset. The signed Twilio callback records accepted versus delivered separately.

Verify configuration and the production deployment, then read `crm_stripe_alerts` for body, provider SID, status, provider status and delivered_at. A provider-accepted result does not establish handset delivery. Do not create a real payment to test; use an authorized pending real receipt or isolated test-mode fixtures.

Rollback: disable `STRIPE_OWNER_ALERTS_ENABLED` and redeploy. Preserve queue evidence and payment ledger rows.
