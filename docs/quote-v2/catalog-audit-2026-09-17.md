# Catalog audit — September 17, 2026

## Scope and conclusion

The shared catalog contains 5 manufacturers, 61 product families, 251 programs,
and 36,954 numeric grid cells. All 251 program cards were captured from the
authenticated production Pricing Grids screen. All 237 rendered matrices matched
their catalog axes and prices exactly; 14 programs use flat/square-foot rate cards.
This verifies the displayed catalog, not universal orderability or dealer pricing.

The requested all-products-live outcome is not established. Source-only grids,
incomplete configuration mappings, missing rate authority and conflicts remain.
In particular, the authenticated Onyx order form offers Signature, Lux and Woven
shade families that have no corresponding shared-catalog product. These are
additional omissions beyond the 61 imported product families.

## Corrected defects

- Windsong (8 colors × 2 cell sizes) and Breeze (5 colors × 2 cell sizes) existed
  in source data but could not pass any offered light-control filter. Both editors
  now offer Woven and preserve it when selecting either series.
- The 3/4-inch single-cell map omitted the flame-resistant program, hiding 18
  additional color/cell offerings. That source-backed route is restored.
- All 191 active honeycomb colors, spanning 678 supported color/cell combinations,
  now reach their expected workbook program in both editors. All 26 Woven
  combinations pass authoritative V2 pricing at 36 × 60 inches.
- The current September 16 Norman Roller Guide withdraws Emery Maize F1561,
  effective September 1 (pages 2 and 77). New selection/pricing is blocked;
  historical identity and pre-withdrawal validation remain intact. The new source
  binary has its own immutable manifest/lock identity. Existing source hashes
  were not replaced.

## Method and evidence

- 40 immutable source binaries verified by SHA-256 and byte length after adding
  the current Roller Guide; historical sources remain retained.
- Polar: regenerated all 79 program matrices from its pinned dealer book;
  every axis and cell matched.
- Sundance: freshly fetched all 18 official PDFs; hashes unchanged. Regenerated
  all 98 matrices, including 18,711 numeric cells; every axis and cell matched.
- Lotus: original importer check reproduced all 20 programs from the 113-page
  source, with 1,494 numeric and 86 unavailable cells, plus stock/custom records.
- Norman: July verifier matched 321 rows, 147 surcharges and 32 motor options.
  Separately, all 371 rows across 41 non-square-foot programs matched the freshly
  downloaded September retail guide. This latter check compares full row prices
  and height, not an independent semantic reconstruction of each width header.
- The current honeycomb workbook has identical values on all seven sheets to
  the pinned workbook, despite different package bytes.
- All 1,284 shared fabric/color identities were inspected: 1,281 active;
  1,138 have direct valid program references and 146 use honeycomb cell routing.
  No dangling direct program references were found. A valid reference alone does
  not prove every combination of controls, sizes and fabrics is orderable.
- Browser checks exercised both real editor components with local save/reload:
  Windsong Toasted Wheat F1527K, 36 × 60, PG1 base $618; Breeze Almond Milk F1299,
  36 × 60, PG2 base $712. Each adds the existing $39 per-unit customer charges.
  These are local browser checks; production release evidence is recorded
  separately with the release SHA.

## Manufacturer completeness

| Manufacturer | Imported families | Programs | Catalog ledger eligible | Remaining limitation |
|---|---:|---:|---:|---|
| Norman | 14 | 47 | 28 | Limited supported configurations. Six shutter rates remain provisional; current binders contain blank base-rate fields. SmartFold, CityLights, Palladian and other flagged configurations require complete restrictions. New motor/SmartFold documents require configuration reconciliation. |
| Onyx | 1 | 7 | 0 | Current account rate/option/panel-limit authority, vinyl rate and minimum-area conflicts. Signature, Lux and Woven shade families are absent. Authenticated Forms supplies a 2020 manual, not a newly dated rate schedule. |
| Polar | 13 | 79 | 0 | Elite portal/book discrepancy; incomplete interior/drapery/awning restrictions. Tension is manual; exterior clutch unavailable. Current dealer-support access is needed. |
| Lotus | 5 | 20 | 0 | FCX/FLX cart/book discrepancies, Side Mount conflict, vane-unit ambiguity and incomplete restrictions. Current account terms need reconciliation. |
| Sundance | 28 | 98 | 0 | Imported source grids require fabric/control/option integration and current account terms. Six families have no imported grid: Verticell, cellular shapes, both shutter families and both exterior systems. |

“Catalog ledger eligible” is the pricing-reference `customerPriceEligible` flag.
It is not a count of every product that can calculate a draft amount. Some
restricted products can calculate limited draft configurations; this does not
remove their evidence or customer-release gates.

## Validation and limits

Before integration: full suite 4,113 passed, 0 failed, 27 pending; typecheck and
production build passed. Current/V1 saved editor state and exact authoritative
Woven prices were verified. No customer message, order submission, existing
quote repricing, database migration or account-factor change was performed.

Private row-level evidence is retained outside source control under
`outputs/catalog-audit-2026-09-17/`: product, program, fabric and honeycomb CSVs;
source manifests; regenerated comparisons; authenticated live grid captures;
test outputs; source PDFs/workbooks; and the final report/release record.

Do not remove unresolved gates merely to mark every grid active. Closing the
remaining scope requires both manufacturer/account evidence and implementation
of each missing family/configuration mapping, followed by live quote checks.
