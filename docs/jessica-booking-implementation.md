# Jessica booking authority — implementation and release handoff

Implemented in `/Users/michaelshepard/Documents/805-jessica-booking`, branch `codex/jessica-booking-authority`, based on remote main `7527ef639b0bfecc7381e56051fcce650c60ca77`. The original dirty checkout is preserved. Nothing has been pushed, deployed, migrated in production, or sent to a customer.

## Completion checklist

- [x] Trace active public/CRM routes and repository schema.
- [x] Shared closed-by-default availability and Google Routes checks.
- [x] Atomic booking, idempotency, route protection, revision/locking migration.
- [x] Published range editor, staff preview, customer refresh and conflict recovery.
- [x] Regression tests, actual PostgreSQL concurrency tests, production build and isolated browser verification.
- [ ] Verify the actual 805 database schema, existing schedule conflicts, and Google Routes configuration using an authorized runtime.
- [ ] Complete staging verification against that schema with delivery disabled.
- [ ] Production release and authenticated/public live verification, after deployment authorization.

## Implemented behavior

Jessica is the only public booking owner. Only explicit `available` ranges with source `crm_working_ranges` count. An empty October, an empty month, draft hours, old click-based hours, a missing database, and unavailable route information cannot generate public openings. Publication replaces the selected month's ranges in one transaction; closing hours preserves confirmed visits. Existing buttons and activity-backed fallback hours migrate to **drafts requiring review and publication**.

The complete consultation must fit within a continuous range. Adjacent ranges may join; a closed gap cannot be bridged. Existing one/two/three-hour duration tiers, half-hour starts from 08:00 through 16:00, same-day four-hour notice and four active non-block appointments per day are preserved. The daily cap counts distinct CRM/legacy commitments, including explicitly Mike-owned appointments, as the prior cap did. Mike-owned visits do not otherwise occupy Jessica's itinerary. Jessica/unassigned visits and busy blocks constrain her bookings. Malformed commitments fail closed and require staff resolution; this is deliberately conservative.

A complete address is validated before availability is displayed. For both neighboring same-day visits, the server requests Google Routes `TRAFFIC_AWARE_OPTIMAL` / `BEST_GUESS` at the relevant departure time, and adds **15 minutes**. Travel cannot cross a busy block. Neighboring visits outside working hours still count; the first and last commute are excluded. Unknown locations, errors and Google's fallback responses are not accepted as zero travel. Forecasts are estimates; later forecasts do not move or cancel confirmed visits.

The dedicated booking page, residential and commercial modals, assistant booking link, and authenticated CRM address/duration preview share the same service. The ordinary CRM calendar labels published ranges as working time; the address-specific preview shows actual customer eligibility and private reason codes. Public responses contain no neighboring customer details.

Customer availability expires after 30 seconds and refreshes on a timer and focus. Superseded responses are ignored. Address, duration and revision changes clear the selected slot. A stale submission receives a conflict response and retains contact fields. Slow requests are allowed to finish rather than being perpetually restarted by polling.

## Transaction and delivery safeguards

Routes are calculated outside the transaction against a revisioned snapshot. A short database transaction takes a **global schedule mutex**, verifies that revision, validates coverage, conflicts, capacity and fresh route evidence, and creates the lead, job, calendar event, draft quote, idempotency result and outbox records together. The global lock is intentionally stronger than separate day locks and provides one lock order for cross-day moves, bulk writes and legacy mirrors. Google calls never hold that lock.

All CRM/legacy appointment and working-range writes advance the revision under the same lock. Deferred constraints protect confirmed public bookings, including different-start overlaps and changed travel neighbors. Staff scheduling supplies replacement proofs; direct legacy/sync changes that need new proofs are rejected with a CRM recheck explanation. Moving a protected public visit requires published coverage; simply closing hours does not cancel it. Old public writers cannot bypass the atomic booking service after migration.

Retries with the same key and payload return the original result. Failed transactions leave no partial records. Post-commit effects are individually claimed from a durable outbox. `BOOKING_DELIVERY_ENABLED` defaults off; staging must keep it off. Optional missing email/webhook effects are skipped. Failed or interrupted deliveries become `uncertain` and are not automatically replayed; staff must verify the provider first. Customer-detail enrichment and Google Calendar exports happen after commit. Google Calendar is an outbound export only, not an availability input.

## Verification evidence

- **135 tests passed** across the booking suite and existing CRM backend tests. Includes empty October, published coverage/boundaries/gaps, all durations, ownership/status handling, mirror deduplication, daily limits, LA midnight/DST, both driving legs and the 15-minute boundary, route failures, provider delivery failures, atomic rollback and old-writer rejection.
- Four tests use a disposable **PostgreSQL 16** container: simultaneous overlapping starts, simultaneous identical retries, closing working hours during checkout, and competing for the last daily capacity. Assertions inspect committed records, not just HTTP responses.
- **Nine browser scenarios** cover customer and CRM range components at 1440/820/375 pixels, residential and commercial modals, stale selection recovery, retained customer fields, 30-second/focus refresh and a late response for an old address. No page overflow or customer page errors were observed. Screenshots were visually reviewed. The CRM component runs in an isolated fixture; this is not authenticated production CRM proof.
- `npm run build` and `npm run typecheck` pass. Build's existing multiple-lockfile root warning is unrelated to booking behavior.
- Browser APIs are intercepted with synthetic data; Google calls are mocked in automated scheduling tests. No test books a live appointment or sends messages. Temporary browser routes and database containers are removed.

Commands from this worktree:

```sh
BOOKING_POSTGRES_TEST=1 npm test -- src/lib/booking src/lib/crm/backend.test.ts
npm run typecheck
npm run build
# In a separate terminal for isolated browser QA:
npm run dev -- --hostname 127.0.0.1 --port 3107 --webpack
node scripts/verify-jessica-booking-ui.mjs
```

After browser QA, stop the development server and remove this worktree's generated `.next/dev` cache before the final type check. The temporary page must not remain in generated development validators.

Browser evidence: `artifacts/booking-authority/browser-results.json` and adjacent screenshots. The browser runner creates its own temporary route and removes it in `finally`; that route must never be deployed.

## Production preflight status

The 805 Supabase connector denied SQL access to `evuxqsaucmvgyuvjpqlo`. The available CLI account also did not expose that project's database. The authenticated Vercel CLI confirmed the configured project **805** (`prj_9FjieADQHKAnV3vWlhY2tHbZbcuc`) and production variable names including `GOOGLE_MAPS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET`. Their usable values were not exposed to the verification runtime; environment export returned redacted values. Temporary exports were removed. Variable names alone do not prove Google Routes is enabled or that the schema matches.

Consequently, live schedule conflicts have **not** been inspected, Google traffic routing has **not** been verified against the production key, and staging/live acceptance remains open. Finish with an 805-authorized Supabase connection and a secure runtime that can use the Google key; do not send credentials in chat.

Prepared read-only checks:

- `scripts/sql/jessica-booking-preflight.sql`: actual columns, provenance index and migration inventory, plus existing incomplete/unassigned/overlapping/over-capacity commitments. Returns IDs for staff review without names, phones or addresses.
- `scripts/jessica-booking-live-preflight.mjs`: service-role REST schema/inventory and Google Places/traffic Routes probes, with an explicit 805 project-host check. Writes a redacted report. Can run with `vercel env run -e production -- node scripts/jessica-booking-live-preflight.mjs` only when the environment supplies usable values.

## Release sequence — deployment authorization still required

1. Verify the actual schema and the legacy provenance mirror/functions against the migration. Run the read-only conflict report; staff resolves unknown ownership, missing locations, overlaps and capacity problems. Validate the server key permits Places and Routes traffic requests. Keep credentials confined to the authorized runtime.
2. Apply the migration to isolated staging, keeping `BOOKING_DELIVERY_ENABLED=false`. Repeat concurrency, public/CRM parity and October-zero-hours checks using that schema and live Google forecasts. Verify failed routes and missing safeguards produce no public opening or partial booking.
3. Review Jessica's converted drafts in the complete range editor. Do not publish inferred broader hours. Identify which exact ranges Jessica approves.
4. During the authorized release, keep public booking closed while applying `20260906145749_jessica_booking_authority.sql` and releasing the matching frontend/server to the configured Vercel **805** target. Use the repository's safe-main publishing procedure and preserve unrelated work.
5. Verify exact deployed source, migration/privileges/triggers, `https://805-one.vercel.app`, `https://www.805shutters.com`, and authenticated CRM on desktop/mobile. Compare identical address/window-count inputs. Confirm October with zero published ranges returns zero openings and stale/concurrent submissions cannot create invalid bookings.
6. Publish Jessica-approved ranges only after safeguards and provider checks pass. Enable the outbox only for the verified production release, with confirmation/export providers and cron configured. Never copy staging outbox rows into production or automatically replay uncertain deliveries.
7. If any required safeguard fails, leave working ranges unpublished and return the closed/unavailable booking response. **Do not roll back to the old default-generating availability code or remove database guards.** Roll forward with a closed booking surface while repairing the issue; preserve confirmed appointments and idempotency records.

Acceptance is local-only at this point. Full acceptance still requires staging/provider verification, authorized release and matching live public/authenticated CRM results.
