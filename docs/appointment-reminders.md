# Sales consultation reminders

Vercel runs `/api/cron/appointment-reminders/` at 02:00 and 03:00 UTC. The handler sends only during the 19:00 hour in `America/Los_Angeles`, covering daylight and standard time. Only scheduled/rescheduled sales consultations on the following Pacific date qualify. Previously recorded sends for the same appointment start are skipped; ambiguous Twilio responses require reconciliation before retrying.

`CRON_SECRET` authenticates Vercel. The separate `APPOINTMENT_REMINDER_CRON_SECRET` authenticates the GitHub watchdog. Both fail closed when absent or invalid. Always use the trailing slash: the site redirects the slashless URL.

The existing CRM integration history records run attempts, successes, and failures. Calendar metadata retains Twilio's message SID and initial provider status. A successful send means provider acceptance, not delivery.

The GitHub workflow is an independent **read-only** watchdog after the nightly run. It requires HTTP 200, valid health JSON, a successful run after the latest Pacific 7 PM deadline, all due reminders recorded, and Twilio delivery confirmation for each. Redirects, missing runs, missing reminders, and unconfirmed delivery fail the workflow. GitHub notification delivery depends on the account's Actions notification settings; this is not a separate SMS/email alert service.

For setup verification, manually dispatch the workflow with `check=readiness`. It validates database access and an active authenticated Twilio account without sending messages, and explicitly reports missing historical records. This does not prove the next scheduled send or customer delivery. The default `check=delivery` verifies the previous evening, even when GitHub starts after midnight.

## September 24, 2026 diagnosis

Commit `bf7d3feb` moved scheduling from Vercel to GitHub on July 11. The workflow posted to a slashless endpoint using `curl --fail` without following or rejecting redirects. The September 24 run `35971830472` ended with `Redirecting...` and a successful job result, without invoking the reminder handler. Recent runs were also hours later than 7 PM Pacific. The production calendar contained no recorded day-before sends at diagnosis. The repair restores Vercel sending and converts GitHub into result verification.
