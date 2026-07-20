# 805 Quote Lab

The Quote Lab is an isolated test harness for comparing the active MTS quote
pricing behavior with the server-authoritative catalog engine before any CRM
cutover.

## Safety boundary

- No Supabase client or database credentials.
- No production quote, customer, contract, bookkeeping, or payment writes.
- No email, SMS, payment-link, signature, or manufacturer-order actions.
- Test quote state exists only in the browser session and disappears on refresh.
- The catalog and comparison endpoints require the `QUOTE_LAB_ACCESS_CODE`
  HttpOnly session cookie.
- Vercel preview hosts are already marked `noindex, nofollow` by `src/proxy.ts`.

The isolation contract is exported as `QUOTE_LAB_ISOLATION` and covered by
automated tests. Quote Lab modules must never import Supabase, notification,
payment, or manufacturer-order modules.

## Routes

- `/quote-lab` - access gate and interactive comparison UI.
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
