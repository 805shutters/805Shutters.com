# 805 Quote Lab

The Quote Lab is an isolated version of the familiar MTS quote-builder workflow.
It uses the existing product and room controls while comparing the active
browser pricing behavior with the server-authoritative catalog engine before any
CRM cutover.

## Safety boundary

- No Supabase client or database credentials.
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

- `/quote-lab` - access gate and familiar quote-builder test UI.
- `POST /api/quote-lab/access` - verifies the preview-only access code.
- `GET /api/quote-lab/catalog` - returns the safe catalog projection and
  anonymized fixtures.
- `POST /api/quote-lab/compare` - validates the request, calculates both engine
  results, applies selected-design billing to the authoritative total, and
  returns order-level freight/oversize exposure separately from retail.

## Included regression scenarios

1. Normal Woodlore pricing agreement.
2. A/B alternatives and legacy sum-all-design behavior.
3. Invalid size with simulated stale stored pricing.
4. Browser-local shutter rate divergence.
5. SmartFold catalog coverage missing from the active legacy switch.
6. Manufacturer freight and oversize cost exposure.
7. A full 40-line whole-home quote through one authoritative request.

## Builder behavior

- Uses the existing MTS `ProductTypeButtons` and `RoomPresetButtons` controls.
- Adds, copies, removes, stacks, and reopens line items without persistence.
- Supports up to six A-F designs per line and bills only the selected design.
- Automatically reprices the entire draft through the protected server route.
- Keeps old-vs-new discrepancies in a collapsed backend audit panel rather than
  changing the normal quote-building layout.

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
