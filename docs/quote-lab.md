# 805 Quote Lab

The Quote Lab mounts the real MTS `QuoteBuilder` component and its real CSS
unchanged at the presentation layer. A provider swaps only the component's
database boundary, replacing production Supabase with an in-memory,
browser-session test adapter backed by protected server-authoritative pricing.

## Safety boundary

- The test adapter never calls production Supabase or uses database credentials.
- No production quote, customer, contract, bookkeeping, or payment writes.
- No email, SMS, payment-link, signature, or manufacturer-order actions.
- Test quote state exists only in the browser session and disappears on refresh.
- The UI and API both enforce a maximum of 40 line items. A 41st line is rejected
  instead of silently dropped.
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
- `POST /api/quote-lab/compare` - validates the request, calculates both engine
  results, applies selected-design billing to the authoritative total, and
  returns order-level freight/oversize exposure separately from retail.
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
   presets, with two independent lines per room, through one authoritative
   request.

## Builder behavior

- Renders the production `QuoteBuilder`, `DesignCard`, `MeasurementGridModal`,
  product/room controls, command bar, quote tabs, and floating total—not copied
  or look-alike replacements.
- Adds, copies, removes, stacks, measures, discounts, and edits line items
  through a test-only Supabase-shaped adapter.
- Enforces 40 stored line-item rows and rejects a 41st with a visible error.
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
