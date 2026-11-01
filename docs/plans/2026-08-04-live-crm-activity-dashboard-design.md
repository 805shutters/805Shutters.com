# Live CRM Activity Dashboard Design

## Outcome

Expand the existing newest-first Recent Financial Activity ledger into one live CRM activity dashboard. The dashboard combines Square, Venmo, Zelle, and other recorded payments with CRM notes, status changes, follow-ups, and general updates without removing any current CRM features.

## Approved experience

- One newest-first scrolling feed, not separate pages.
- Tabs filter the same feed. The seven tabs are Operational timeline, Raw audit, Payments, Updates, Notes, Follow-ups, and Signed contracts. Operational timeline is the default.
- Every row shows source, customer, event type, amount when applicable, timestamp, and a concise description.
- Selecting a row opens customer context with that customer's full activity timeline, payment history, notes, current status, and follow-up state.
- New activity is checked in the background. If the viewer is away from the top, incoming rows are buffered and a jump-to-top indicator appears so the current reading position is not disturbed.

## Architecture

`loadCrmActivitySnapshot` reads four tables in parallel: `crm_activity_events` ordered by `created_at`, `crm_quote_bookkeeping_payments` ordered by `paid_at`, `crm_quotes` ordered by `signed_at` (rows without `signed_at` are dropped), and `crm_business_events` ordered by `occurred_at`. Business rows are mapped onto the activity list. Each read uses `loadCompleteCrmTable`, which pages 500 rows at a time until a page is empty. A table that reaches 10,000 pages returns an error and no partial page. No new database table or browser-visible RLS policy is required.

An authenticated, no-store Next.js route returns that snapshot. It uses the existing `requireCrmUser` server authorization path, so service credentials remain server-only. The browser polls this endpoint while the CRM is open.

A pure normalization module resolves audit entities to customer names using the CRM records already loaded by the dashboard. It classifies each event, creates concise descriptions, de-duplicates payment audit noise against canonical payment rows, and returns a stable newest-first event model. This model also powers per-customer filtering and tab counts.

## Components and data flow

1. CRM login loads the existing dashboard data unchanged.
2. The activity snapshot endpoint loads the four tables above in parallel and pages each one until it is exhausted.
3. `CrmApp` stores the snapshot and refreshes it on a visibility-aware interval.
4. `UnifiedActivityFeed` normalizes payments and audit records with the current jobs, quotes, bookkeeping rows, and customers.
5. When new stable event IDs appear:
   - at the top, render them immediately;
   - away from the top, keep the rendered list fixed, display the new-activity count, and merge them only when the viewer jumps to the top.
6. Selecting an event displays an activity detail panel derived from the same normalized timeline plus current CRM job and bookkeeping state.

## Error handling and security

- The endpoint returns no secrets and is protected by the existing approved-user authorization.
- Audit-log read failures degrade to payment-only activity; payment read failures degrade to CRM-only activity. A complete snapshot failure returns an authenticated API error.
- Poll failures preserve the last successful feed and show a subtle stale-state message rather than clearing the dashboard.
- Each of the four tables is paged 500 rows at a time until the table is exhausted. The reader stops with an error, and returns no partial page, after 10,000 pages.
- The activity response is private and `no-store`.

## Testing and release

- Unit-test classification, customer resolution, descriptions, de-duplication, tab filtering, and newest-first sorting.
- Route-test authentication, parallel reads that page until exhaustion, graceful partial failure, and cache headers.
- Component/source tests cover all seven tabs, required row fields, customer detail sections, polling, and new-activity buffering controls.
- Run repository-required typecheck, unit tests, and production build.
- Commit and push `main`, deploy through the repository's verified Vercel workflow, then verify the authenticated CRM route and production site health.

