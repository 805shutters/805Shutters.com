# Weekly closed-sales text

The report is sent separately to Jessica and Mike every Sunday at 5:00 p.m. in
`America/Los_Angeles`. It covers the current Monday through the Sunday 5 p.m.
cutoff. The CRM card defaults to the previous **completed** Monday–Sunday week;
its final total can therefore include contracts signed after the text's cutoff.

Message template:

> 805 Shutters weekly sales — Mon, Sep 14–Sun, Sep 20, 2026. Gross signed sales as of Sunday 5:00 PM Pacific: $[total].

If signing evidence is incomplete, the message says how many records need review
and that the amount includes verified sales only. Missing dates are flagged
because their reporting week cannot be known. An empty, successfully loaded
week sends `$0.00`; a database read failure sends no misleading zero.

## Schedule and configuration

- Route: `/api/cron/weekly-sales/`, authenticated with `CRON_SECRET` (required).
- `vercel.json` schedules Monday 00:00 and 01:00 UTC. The route permits only
  Sunday 17:00–17:59 Pacific, covering both daylight and standard time.
- Every calculation uses the fixed Sunday 17:00 cutoff, even if the invocation
  arrives later within that hour.
- Recipients: `JESSICA_805_SALES_SMS_NUMBER` and `MIKE_805_SALES_SMS_NUMBER`.
  Both must be valid and distinct. Other shop-notification lists are not used.
- Sender: existing Twilio configuration (`TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_PHONE` or `TWILIO_MESSAGING_SERVICE_SID`).
- All of these settings already have production entries in Vercel project
  `805`. Sensitive values cannot be verified through the CLI environment export.
- The cron becomes active only with a production deployment. No migration is
  needed. Do not invoke the route as a live send test without authorization.

## Calculation and duplicate protection

`loadWeeklySalesSmsReport` loads all original jobs, quotes, contracts,
bookkeeping entries, and customers, failing on any incomplete read. It uses
`buildClosedSalesReport` with the current week enabled and an explicit cutoff.
The card's signing evidence, snapshot precedence, cents, alternative selection,
and duplicate-contract rules remain shared.

`crm_activity_events` stores a single immutable report snapshot per week and a
separate claim for each named recipient. Deterministic UUID primary keys prevent
overlapping cron runs from sending twice. Both recipients use the first saved
message and total even if source records change between attempts.

Audit actions:

- `weekly_sales_sms.report`: saved report and message.
- `weekly_sales_sms.claimed`: send reserved; a crash here requires review.
- `weekly_sales_sms.accepted`: Twilio returned a message SID; this is provider
  acceptance, not handset delivery confirmation.
- `weekly_sales_sms.needs_review`: failed or uncertain provider result.

Failed/uncertain attempts are not automatically resent. Before any manual
recovery, check Twilio using the recorded recipient, timestamp, and SID where
available. An unresolved review returns an error status on repeated invocations.
Use the provider's message status to distinguish accepted from delivered.

## Verification

`weekly-sales-sms.test.ts` covers Pacific scheduling, both DST changes, year
boundaries, the fixed cutoff, signed-date attribution, zero/evidence-gap copy,
two exact recipients, concurrent/repeated invocations, immutable message totals,
uncertain sends, database failures, missing recipients, and cron authentication.
`dashboard-metrics.test.ts` covers the shared contract amount and deduplication
rules. No live SMS is sent by these tests.
