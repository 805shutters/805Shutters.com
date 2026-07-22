# 805 Quote Lab

The Quote Lab mounts the real MTS `QuoteBuilder` component and its real CSS at
the presentation layer. A provider swaps only the component's database
boundary, replacing production Supabase with an isolated SQLite test database
backed by protected server-authoritative pricing. See
`docs/quote-v2.md` for the V2 catalog, source, and cutover contract.

## Safety boundary

- The test adapter never calls production Supabase or uses database credentials.
- No production quote, customer, contract, bookkeeping, or payment writes.
- No email, SMS, payment-link, signature, or manufacturer-order actions.
- Test quote state persists across refreshes in the isolated test database and
  never enters production Supabase.
- Each successful unlock receives a random HttpOnly workspace nonce, so a new
  browser context cannot inherit another test run's saved quote state.
- The UI and API both enforce a maximum of 40 measured-window line items.
  Quantity remains independent, and a 41st line item is rejected.
- The catalog and comparison endpoints require the `QUOTE_LAB_ACCESS_CODE`
  HttpOnly session cookie.
- Vercel preview hosts are already marked `noindex, nofollow` by `src/proxy.ts`.

The isolation contract is exported as `QUOTE_LAB_ISOLATION` and covered by
automated tests. Quote Lab modules must never import Supabase, notification,
payment, or manufacturer-order modules.

## Routes

- `/quote-lab` - access gate followed by the exact existing quote-builder UI.
- `POST /api/quote-lab/access` - verifies the preview-only access code.
- `GET /api/quote-lab/catalog` - returns the safe catalog projection and
  anonymized fixtures.
- `POST /api/quote-lab/compare` - compatibility and regression-fixture endpoint
  used during initialization; it is not exposed as a replacement UI panel.
- `GET /api/quote-lab/state` - loads the authenticated preview session's saved
  workspace state, optimistic revision, and last-updated timestamp from the
  isolated SQLite test database.
- `PUT /api/quote-lab/state` - saves the authenticated preview session's whole
  workspace state with an expected revision; stale concurrent writes are
  rejected with HTTP 409, and the 40-line limit is enforced again server-side.
- `POST /api/quote-lab/state` - revision-safely replaces only the authenticated
  workspace with a server-generated empty quote carrying a unique test-run ID.
  It accepts only `expectedRevision`; clients cannot inject reset-state rows.
- `POST /api/quote-lab/price-exact` - accepts the existing builder's line/design
  payload, discards its submitted price, and returns a fresh authoritative
  catalog price.
- `POST /api/quote-lab/reprice-exact` - reprices every design and computes the
  selected-design quote total together on the server after each builder edit.

## Included regression scenarios

1. Normal Woodlore pricing agreement.
2. A/B alternatives and legacy sum-all-design behavior.
3. Invalid size with simulated stale stored pricing.
4. Browser-local shutter rate divergence.
5. SmartFold catalog coverage missing from the active legacy switch.
6. Manufacturer freight and oversize cost exposure.
7. A full 40-line whole-home quote using the builder's twenty real room
   presets, with two independent line items per room, through one authoritative
   request.

## Builder behavior

- Renders the production `QuoteBuilder`, `DesignCard`, `MeasurementGridModal`,
  product/room controls, command bar, quote tabs, and floating total—not copied
  or look-alike replacements.
- Adds, copies, removes, stacks, measures, discounts, and edits line items
  through a test-only Supabase-shaped adapter.
- Enforces 40 stored measured-window rows and rejects a 41st with a visible
  error.
- Reprices edits through `POST /api/quote-lab/reprice-exact`; the adapter ignores
  browser-submitted `unit_price` values and keeps the displayed contract total
  authoritative.
- Leaves send and payment controls visually unchanged but safely inert.

## Local verification

```bash
QUOTE_LAB_ACCESS_CODE=local-test-code npm run dev
npm run typecheck
npx vitest run src/lib/quote-lab
npm run build
```

No Quote Lab branch should be promoted to production. A later production
cutover must be a separate, explicitly approved change with backward-compatible
database migrations and an immediate feature-flag rollback.
