# Sent quote communication hub

The 805 Sent view now opens a customer conversation workspace with four editable email actions: Still interested, Offer savings, Send inspiration, and Personal message. Drafts, internal notes, uploaded photos, sent messages, and imported replies persist against the canonical CRM quote. Sales quotes use their existing CRM mirror relationship.

## Sending and pricing

Staff first preview the final recipient, subject, email body, photos, and offer, then click Send email now. The backend uses the existing Resend provider with `805@805shutters.com` as From and Reply-To. The history says the provider accepted an email; it does not claim inbox delivery. No real customer messages were sent during implementation or testing.

A savings offer applies an additional percentage to the remaining product share, retains fees and existing discounts, recalculates tax/deposit with the existing money engine, and copies exact product, design, and cost snapshots into a separate quote version. The original quote price is preserved. Offers require fully priced and reconciled amounts and apply to the complete project. Sold, signed, archived, changed-after-preview, or already-pending quotes are blocked.

Each reviewed message has a stable provider idempotency key. A timeout remains visibly uncertain; Check delivery retries the identical request within 23 hours. New sends remain blocked while a message is uncertain. After that window, or if the customer/quote becomes ineligible, verify the existing message in the provider before a staff-reviewed repair. Do not clear uncertain history and blindly send a replacement.

The existing stale-quote reminder loop skips a quote once the hub has claimed a message or imported a reply, so a staff-managed conversation does not also receive generic reminders.

## Release requirements

The Sent view probes the hub tables and a read-only fingerprint RPC before showing the hub. If setup is unavailable, the existing quotes table stays usable with a Check again button. This allows the reviewed code to be published while database access is being restored.

- Apply `supabase/migrations/20260906195837_quote_communication_hub.sql` to the intended 805 database before releasing the application. It creates service-only message/photo tables, a private photo bucket, and guarded SQL functions. This migration has only been exercised in an isolated local Postgres database, not production.
- Keep the existing `RESEND_API_KEY` configured and the 805 sending identity verified in that provider.
- Reply refresh requires an OAuth connection to the exact `805@805shutters.com` Gmail mailbox, with Gmail read access. The server accepts dedicated `GMAIL_805_CLIENT_ID`, `GMAIL_805_CLIENT_SECRET`, and `GMAIL_805_REFRESH_TOKEN`, or the existing mailbox token broker. It checks the mailbox profile before reading. This checkout did not have the dedicated connection configured; live mailbox sync is unverified.
- Uploads accept JPEG, PNG, or WebP signatures, at most 2 MB per photo, six photos and 8 MB combined per email. Built-in photos are included in the Next server bundle.
- The initial build did not push, migrate production, deploy, activate automation, or send live messages. The subsequent publication is separately verified; production database setup and live mailbox verification remain access-dependent.

## Verification

- The reconciled main baseline passed 3,247 tests (32 environment-dependent skips), plus three readiness checks. The initial 79 focused tests passed across quote hub, isolated database, email provider mocks, public quotes, quote versions, and sales-send regression suites.
- Five Playwright checks passed: discount preview/send simulation, four actions/drafts/notes/photo order, 375px mobile layout and invalid pricing, uploads/customer draft isolation, and unauthenticated API rejection.
- TypeScript and the Next production build passed. Production returns 404 for the local-only preview, and protected APIs return 401 without a session. All three inspiration assets were found in the route file trace.
- The development-only `/crm/quote-hub-preview/` uses the real component with sample records and simulated sending. It never calls CRM APIs.

Repeat the focused checks:

```sh
npm test -- src/lib/crm/quote-hub.test.ts src/lib/crm/quote-hub-delivery.test.ts src/lib/crm/quote-groups.test.ts src/lib/crm/public-quote.test.ts src/lib/crm/sales-quote-send.test.ts
# Dedicated disposable Postgres container only; never point at a production DB.
docker run --name 805-quote-hub-test-db -e POSTGRES_PASSWORD=local-quote-hub-test -p 127.0.0.1:55868:5432 -d postgres:16
QUOTE_HUB_DB_TEST=1 npm test -- src/lib/crm/quote-hub.integration.test.ts
# Run a development server on port 3185 in a separate terminal first.
E2E_BASE_URL=http://localhost:3185 npx playwright test e2e/quote-hub-ui.spec.ts
npm run typecheck
npm run build
```
