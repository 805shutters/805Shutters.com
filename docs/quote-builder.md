# Quote Builder

A window-treatment quoting system: a verified Norman pricing catalog, a pure pricing
engine, line-item quotes with **pick-one** design alternatives, a CRM builder UI, and a
customer-facing signable quote with Twilio SMS confirmation.

Ported and rebuilt from the legacy MTS CRM quote builder, with every known MTS bug
structurally prevented (see "Design guarantees" below).

## File map

| Area | Path |
| --- | --- |
| Catalog data (shades/blinds) | `src/lib/quote/catalog/norman-2026.catalog.json` |
| Catalog data (shutters, **provisional**) | `src/lib/quote/catalog/shutters-mts.catalog.json` |
| Catalog loader / types | `src/lib/quote/catalog/index.ts`, `.../types.ts` |
| Pricing engine (pure) | `src/lib/quote/pricing.ts` |
| Measurements | `src/lib/quote/measurements.ts` |
| UI catalog projection | `src/lib/quote/ui-catalog.ts` |
| Product detail schema | `src/lib/quote/product-options.ts` |
| Backend domain layer | `src/lib/crm/quote-builder.ts` |
| Public/customer flow | `src/lib/crm/public-quote.ts` |
| Twilio SMS | `src/lib/notify/twilio.ts` |
| CRM builder UI | `src/components/crm/quotes/QuotesWorkspace.tsx` + `src/components/crm/QuoteBuilderPanel.tsx` |
| Customer page | `src/app/quote/[token]/page.tsx` + `SignQuote.tsx` |
| API routes | `src/app/api/crm/quote-catalog{,/price,/reference}`, `.../quote-line-items/[id]{,/select}`, `.../quote-designs{,/[id]}`, `.../quotes/[id]/{builder,share}`, `src/app/api/quote/[token]/accept` |
| DB migrations | `supabase/migrations/20260618000000_create_quote_builder_line_items.sql`, `20260618010000_add_quote_versions.sql`, `20260621010000_add_quote_builder_details_and_wholesale.sql` |

## Products currently represented

805 now exposes the represented catalog products through one room -> product -> dimensions
-> details -> add-ons -> final quote flow:

- Norman shades/blinds/accessories: CityLights Aluminum, Ultimate Faux Wood,
  Portrait Honeycomb, Palladian Shelf, PerfectSheer, Soluna Roller, Centerpiece Roman,
  SmartDrape, SmartFold, SmartPrivacy Faux, Synchrony Vertical, Portrait Vertical
  Honeycomb, Ultimate Normandy Wood.
- Shutters from the legacy MTS catalog: Norman Shutters and Onyx Shutters.
- Add-ons: catalog product surcharges and Norman motorization groups are selectable in the
  builder and priced by the server engine.

The builder detail schema covers mount, controls, valances, light control, shutter frame,
louver, color, hinge, panel configuration, track/specialty choices, and internal install
flags. Internal-only details are hidden from customer quote output.

## Source audit notes

- Legacy MTS source compared: `src/components/crm/quote-builder/QuoteBuilder.tsx`,
  `DesignCard.tsx`, `src/lib/quoteConstants.ts`, `src/lib/pricingData.ts`, and
  `src/lib/pricingEngine.ts` in `/Users/michaelshepard/Documents/MTS`.
- Norman dealer portal checked: dealer login, Program Binder, product sections, and the
  2026 Retail Price Guide link. The account-specific product-pricing security-code screen
  did not unlock with the normal dealer password, so account wholesale grids were not
  extracted from Norman.
- Onyx portal checked: login, forms, existing order detail printout, and internal totals.
  The sampled stained basswood order line matched the MTS wholesale rate of $16.50/sqft.
- Sundance portal checked: login dashboard, order list, tariff warning, and public product
  price guide links. Sundance product families observed there are not fully imported into
  the 805 pricing catalog yet.

## Design guarantees (the MTS bugs that can't come back)

- **Pick-one billing**: a window can have A/B/C alternatives, but only the one in
  `crm_quote_line_items.selected_design_id` is billed. (MTS summed them → triple-billing.)
- **Server-authoritative pricing**: `unit_price` + `price_breakdown` are computed by the
  engine on the server on every write; clients never set a price.
- **No silent wrong price**: out-of-range / NA / unknown-fabric return an explicit error
  code and price 0 with `price_status != "ok"`, which contributes **0** to the total — never
  a guessed or cheapest-grid number.
- **One source of truth**: quote total = sum of selected designs; recompute also syncs the
  1:1 bookkeeping entry total and the parent job estimate.
- **Wholesale separation**: `wholesale_unit_price` and wholesale pricing breakdown values are
  computed for internal CRM reference only. Public quote projection never emits wholesale
  fields or internal-only detail flags.

## Go-live: apply the migration

Migrations are **not** applied by `deploy:vercel`. Apply this one to the live 805 Supabase
project before deploying code that uses the new tables:

```bash
# from 805Shutters.com, with Supabase CLI linked to the project
supabase db push
# OR paste these into the Supabase SQL editor and run them, in order:
#   supabase/migrations/20260618000000_create_quote_builder_line_items.sql
#   supabase/migrations/20260618010000_add_quote_versions.sql
#   supabase/migrations/20260621010000_add_quote_builder_details_and_wholesale.sql
```

`20260618000000` creates `crm_quote_line_items` + `crm_quote_designs` and retires the
dormant `crm_quote_items` stub **only if empty**. `20260618010000` adds
`quote_group_id` + `quote_label` for whole-quote versions. `20260621010000` adds
structured design `details` and internal-only `wholesale_unit_price`.

## Twilio (customer + shop SMS on sign)

Set in env (already scaffolded in `.env.example`):
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_MESSAGING_SERVICE_SID` or
`TWILIO_FROM_PHONE`. Signed-sale shop notifications use
`MIKE_805_SALES_SMS_NUMBER` and `JESSICA_805_SALES_SMS_NUMBER` when configured,
falling back to the established `805-298-5555` and `805-630-0848` recipients;
`805-914-4917` remains required and `CRM_SOLD_QUOTE_SMS_NUMBERS` can add validated
recipients. Per-recipient provider outcomes are persisted in
`crm_sold_quote_sms_notifications`. A successful Twilio API request is recorded as
`accepted`, not delivered; the signed status callback advances it to `delivered` or
`undelivered`, with transient callback retries enabled. Safe pre-acceptance failures can retry, while uncertain or
provider-accepted outcomes are held to prevent duplicate texts. The customer SMS goes
to the linked job's phone. **Without keys, business sends are recorded as failed and
can retry after configuration is restored** (the sign flow still works).

## Running the integration test (the live pass)

`src/lib/crm/quote-builder.integration.test.ts` drives the real backend against a real DB
through the whole lifecycle. It is opt-in and skipped by default.

Easiest, isolated (needs Docker):

```bash
supabase start                 # local Postgres + applies migrations
# copy the printed API URL + service_role key, then:
NEXT_PUBLIC_SUPABASE_URL=<local-url> \
SUPABASE_SERVICE_ROLE_KEY=<local-service-key> \
QUOTE_INTEGRATION_OK=1 \
  npx vitest run src/lib/crm/quote-builder.integration.test.ts
supabase stop
```

Against a **non-production** project: apply the migration there, then run the same command
with that project's URL + service key. Do not point it at production.

## Manual QA checklist (deployed app)

1. CRM → Quotes → **Create quote** or open a scheduled consultation → **Builder**.
2. Add a window (room, width, height, qty). Add option **A** (e.g. Honeycomb 9/16) → price shows.
   Add option **B** (e.g. a roller fabric). Select **A** → total reflects A only.
3. Change quantity → total scales. Try an oversize width → option shows an error, not a price.
4. **Customer link** → open `/quote/<token>` in an incognito window → review → sign → confirm
   it flips to **sold**, the order card updates, and (if Twilio is live) SMS arrives.

## Tests

```bash
npx vitest run            # full unit + stress suite
npx tsc --noEmit          # typecheck
npx next build            # production build
```

## Pricing catalog maintenance

- **Shutters are provisional** (ported from legacy MTS, flagged in the UI). Onyx wholesale
  spot-checks matched the portal sample. Norman account wholesale needs the dealer
  pricing-security code before replacing the provisional MTS rates.
- Sundance categories are source-identified but not fully priced in this catalog. Import the
  Sundance PDF grids before claiming complete Sundance parity.
- Catalog ingestion tooling (PDF → verified JSON) lives in `~/805/_catalog_extract/`
  (`layout.py`, `consolidate.py`, `build_shutters.py`, `validate_catalog.py`).
