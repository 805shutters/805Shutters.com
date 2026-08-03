# V4 Pricing Engine Test Audit — 2026-07-27

## Result

The released V4 lookup and calculation engine covers Norman, Onyx, and Lotus.
It passed exhaustive catalog reconciliation, round-up, quantity, wholesale,
upcharge, motorization, unavailable-cell, type, and production-build tests.

Polar is explicitly outside the V4 pricing launch. Every Polar selection is
persisted as an internal `QUOTE ONLY` task and fails closed before pricing,
customer send, status advance, order preparation, or manufacturer action.
Polar products, programs, grids, motorization, and surcharges are excluded from
the released browser pricing reference. No Polar source amount is used to
calculate a customer quote or dealer cost.

No production deployment or customer quote was changed by this audit.

## Exhaustive Coverage

| Check | Coverage | Result |
| --- | ---: | --- |
| Exact priceable grid cells | Non-Polar catalog | Passed against the committed catalog |
| Explicit unavailable/null cells | Non-Polar catalog | Rejected without fallback |
| Published dimension/rule blocks | Non-Polar catalog | Rejected |
| Between-grid round-up cases | Non-Polar catalog | Rounded to the next published width and height |
| Representative programs | Norman, Onyx, Lotus | Quantity, discount, and money invariants checked |
| Programs with wholesale tracking | Norman, Onyx, Lotus | Wholesale remained separate from discount |
| Priced product upcharges | Non-Polar catalog | Priced and included in totals |
| Explicitly blocked upcharges | Non-Polar catalog | Failed loudly instead of using zero |
| Priced motor/control choices | Non-Polar catalog | Mapped amount included in totals |
| Unavailable motor/control choices | Non-Polar catalog | Failed loudly |
| Polar selections | Every Polar product | `MANUAL_PRICE_REQUIRED` / `manual_quote_required`; no amount emitted |
| Immutable manufacturer artifacts | 16 | File size and SHA-256 verified |

Repository verification:

- 1,818 tests passed.
- 5 unrelated tests were skipped by their existing suite configuration.
- TypeScript type-check passed.
- Next.js production build passed.
- `git diff --check` passed.

## Polar Source Importer Excluded From Launch

Affected product: `polar_interior_roller`

Affected programs: Price Groups 1 through 14.

Affected grid row: 156-inch height.

Affected columns: widths 156 through 288 inches, 12 cells per price group,
168 corrupted cells total.

Cause: each Polar continuation page starts with the width header
`156", 168", ... 288"`. `scripts/generate-polar-catalog.py` treats the header
as a 156-inch-height price row before it reaches the real row. The committed
catalog therefore contains dimension values such as 168, 180, and 192 as
prices. The actual dealer-book row contains materially different prices.

Example, Price Group 1 at 156-inch height:

- Catalog right-side values begin `168, 180, 192, ...`.
- Dealer book page 27 shows `1416, 1483, 1977, 2046, ... 4412`.

The importer defect and all Polar pricing output are removed from the launch
path. Correcting or interpreting this source is not a release dependency:
runtime pricing blocks every Polar product before grid lookup, and released
pricing-reference payloads contain no Polar grids or option prices.

## Source-Confirmed Price Decreases

A monotonicity audit found some larger dimensions priced below adjacent smaller
dimensions. This is not automatically an engine defect: the engine correctly
uses the exact published cell.

Two Norman examples were visually verified in the July retail guide:

- Honeycomb 9/16-inch Cordless Single Cell, width 120: height 54 is $923 and
  height 60 is $918.
- Roman Cordless Price Group 1, height 102: width 66 is $1,730 and width 72 is
  $1,702.

Lotus also contains non-monotonic dealer-cost cells, and its 3x retail values
preserve those source amounts exactly. Examples inspected on Lotus source pages
97, 101, and 105 match the supplier book. These values should not be
"corrected" by interpolation or monotonic smoothing.

## Test Artifact

`src/lib/quote/pricing.v4-exhaustive.test.ts` preserves exhaustive non-Polar
reconciliation coverage. `src/lib/quote/pricing.polar.test.ts` and
`src/lib/quote-v2/polar-manual-quote.test.ts` enforce the Polar quote-only hold.
