# Customer appointment notifications — PR verification and activation boundary

Company: **805 Shutters**. Repository: `805shutters/805Shutters.com`.
Production database: `evuxqsaucmvgyuvjpqlo`. This change was implemented in an isolated branch with GitHub write identity `805shutters`.

## Root causes

1. **False-success redirect:** the old GitHub workflow POSTed to `https://805-one.vercel.app/api/cron/appointment-reminders` without a trailing slash. Both trailing-slash canonicalization and the Vercel-host redirect could intercept it. `curl --fail` does not reject 3xx, and the workflow neither followed the redirect nor checked the service response. The two previously inspected runs ended with `Redirecting...`, then passed:
   - [34678969175](https://github.com/805shutters/805Shutters.com/actions/runs/34678969175): request at 2026-09-12 06:45:46 UTC (September 11, 11:45 PM Pacific).
   - [34680544246](https://github.com/805shutters/805Shutters.com/actions/runs/34680544246): request at 2026-09-12 07:22:06 UTC (September 12, 12:22 AM Pacific).
2. **Late starts:** GitHub's scheduled workflow was being launched hours after its configured 02:00/03:00 UTC times. Those UTC offsets were correct for 7 PM Pacific across DST; the late invocation was the problem, not timezone conversion. The handler correctly refused to send outside hour 19, so repairing the URL alone would still have missed reminders. The available logs establish late invocation, not GitHub's internal reason for the delay.
3. **Manual confirmation gap:** `createCrmCalendarEvent` called `booking_admin_create`, updated the job, mirrored Google Calendar and notified assigned staff. Only public `booking_commit` queued customer effects in `booking_outbox`.

## Changes and files

| Files | Behavior |
| --- | --- |
| `supabase/migrations/20260912233000_customer_appointment_notifications.sql` | Durable per-event/channel ledger, atomic claim, manual-save transaction trigger, CRM operational-timeline audit. No historical confirmation backfill. |
| `src/lib/crm/appointment-customer-delivery.ts` | Manual SMS/email confirmation worker and reminder worker; explicit production approval gate; contact validation; provider receipts; date deduplication; cancellation/reschedule checks; no automatic replay of uncertain sends. |
| `src/lib/booking/delivery.ts` | Exposes the existing public SMS and email content for reuse. Public delivery effects and staff notifications remain intact. |
| `src/lib/notify/twilio.ts` | Optional bounded timeout and redirect rejection used by the new sends. Existing callers retain their behavior. |
| `src/lib/crm/calendar-notifications.ts` | Retires the old non-atomic reminder loop; preserves reminder wording, Pacific date helpers, replies and staff alerts. |
| `src/app/api/cron/booking-outbox/route.ts` | Processes the new manual queue after the existing public queue. Public enablement is unchanged; the new queue has its own gate. |
| `src/app/api/cron/appointment-reminders/route.ts` | Authenticated service; typed result; HTTP 503 on delivery failures; explicit dry-run, paused and outside-window states. Missing cron secrets fail closed. |
| `src/app/api/cron/appointment-reminder-dispatch/route.ts` | Calls the canonical service and checks its acknowledgement. Redirect/interstitial/invalid response produces HTTP 503, error logging, and a staff-visible CRM follow-up alert. |
| `scripts/check-appointment-reminders.mjs`, `.d.mts` | Shared strict service-response checker. All redirects are rejected; credentials are never forwarded. CLI is dry-run only and emits a GitHub error annotation on failure. |
| `next.config.mjs` | Narrow Vercel-host redirect exception for the reminder service, dispatcher and confirmation worker; website canonical redirects remain. |
| `vercel.json`, `.github/workflows/appointment-reminders.yml` | Vercel dispatcher every minute during 02:00–03:59 UTC; server enforces 19:00–19:59 Pacific. GitHub becomes a manually invoked dry-run checker, not the send scheduler. |
| `.env.example` | Documents `APPOINTMENT_CUSTOMER_SENDS_ENABLED=false`. |
| `src/lib/crm/appointment-customer-delivery.database.test.ts`, `appointment-reminder-service.test.ts`, `appointment-reminder-routes.test.ts` | Local Postgres, transport, route and timing regressions. |

Vercel documents per-minute invocation precision on Pro/Enterprise and no redirect following for cron requests: [timing and redirects](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing). The repository already uses a minute-level Vercel worker. Verify the current plan and installed schedule before activation; no live scheduling guarantee has been claimed from fixture tests.

## Delivery rules

- Only new staff-authoritative scheduled customer events queue confirmations; blocks and technical measures retain their existing behavior.
- Each appointment queues one SMS and one email entry. SMS uses the single valid phone explicitly attached to its linked job. Multiple/invalid numbers are skipped rather than guessed. Email can still proceed. Missing both produces staff-visible failures.
- Email content and SMS text are shared with public booking. The new email path fixes From/Reply-To to `805@805shutters.com`. SMS uses the existing 805 repository Twilio sender configuration. No other company's credentials are loaded.
- One reminder SMS per event and Pacific appointment date. Existing reminder metadata prevents duplicates across migration. Repeated calls, overlapping workers and same-date reschedules do not resend accepted reminders.
- Before each provider call, the worker rechecks eligibility and the approved Pacific hour. Late starts explicitly return `outside_window`; they do not send the next morning or at an arbitrary hour. Unclaimed work can be picked up by the next minute within the window. A missed evening requires staff review; it is not silently moved to an invalid reminder day.
- `accepted` requires a provider ID. It means provider acceptance, not delivery or customer reading. Provider uncertainty and interrupted claims are retained for staff review, not automatically replayed. Failures remain visible in the operational timeline and cause a failing worker response.

## Verification performed without live sends

- `npm test`: 435 test files passed; 3,591 tests passed; 33 skipped.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Focused tests: 79 passed, including real local PostgreSQL execution of the manual scheduling RPC, trigger and claim functions; public booking RPC still queues its original customer effects; simultaneous workers; missing contacts; canceled/moved appointments; legacy receipts; rollback; 7 PM checks and the previously observed late times; provider and HTTP response failures.
- Local production-server requests with the production Vercel Host header returned JSON 401 directly from reminder endpoints, with no redirect. The website root and `/about/` retained the 308 canonical redirect. Authenticated local dispatcher with the gate disabled returned `{ "status": "paused" }`.
- No live reminder endpoint was invoked. No production database migration, configuration update or send was performed. Bernidet and all other live customers were not contacted.

## Review and activation — NOT authorized by this PR

Stop at the PR. Do not merge, apply the migration, deploy, enable sends or contact a customer under the current authorization.

After Mike separately approves the relevant step:

1. Reverify 805 GitHub write identity, production project, Supabase project and existing 805 sender identities. Review and apply the migration only to `evuxqsaucmvgyuvjpqlo`.
2. Merge/deploy with `APPOINTMENT_CUSTOMER_SENDS_ENABLED` still absent or `false`. Preview and non-805 project sends remain prohibited even if the flag is accidentally set.
3. Verify the canonical dry-run service, the Vercel plan/schedule and the authentication headers. The checker defaults to `?dry_run=true`; it does not queue, claim or contact anyone. Inspect the CRM operational timeline and notification ledger for pending, failed or uncertain work.
4. **Named approval required:** enable production manual customer confirmations and the 7 PM Pacific reminder dispatcher. This changes `APPOINTMENT_CUSTOMER_SENDS_ENABLED` to `true` on the verified production release. Review the pending queue before activation; no bulk replay or historical backfill is included.
5. Any live test requires Mike to name the customer and explicitly authorize the send. Then inspect the provider ID and provider delivery status separately; do not equate HTTP success with delivery.

Read-only inspection after deployment: query `appointment_customer_notifications` by event ID, and open the CRM operational timeline. Never reset `processing`, `accepted` or `uncertain` records to pending without verifying provider history and obtaining authorization for any resulting send.
