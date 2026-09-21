# Poly Composite H3 selling option

The existing CRM owner policy prices exact Onyx Poly Composite H3 Hidden Tiltrod In Stile at $10 per actual panel. This increment adds `poly_composite_h3_per_panel`, scoped to `poly_composite`, and preserves `hidden_tilt_rod` as the separate, unverified-retail dealer evidence. The normalized H3 selection retains `tilt_source_code`; generic `hidden` alone is insufficient to choose this owner policy.

`withOnyxPolyH3Surcharges` replaces duplicate/legacy tilt options with one canonical option, using L/R layout count. Four panels cost $40; two cost $20 per shutter. Line quantity remains the pricing engine's responsibility. Missing/ambiguous panel count returns a pricing block. Other products, programs and H1/H2 do not acquire this price.

This is selling-price evidence only. The option carries `wholesaleUnverified`; pricing retains known base cost but omits inferred H3 wholesale cost and complete wholesale totals. The verified lower cost bound still protects against discounts below known cost. Base $31/square-foot and eight-square-foot minimum remain unchanged. The existing base policy source ID now resolves to a hashed record of the already-imported owner evidence.

Parent integration (engine.ts intentionally untouched):

1. Import `onyxPolyH3`, `withOnyxPolyH3Surcharges`, `ONYX_POLY_H3_SOURCE`, `ONYX_POLY_H3_SURCHARGE_ID` from `./onyx-poly-h3`.
2. Wrap the final result of `authoritativeAutomaticSurchargeSelections` with `withOnyxPolyH3Surcharges(selection, existingArray)`.
3. Include `...(onyxPolyH3(selection)?.issues ?? [])` in unfiltered price-input validation, so missing charged panel count stays blocked in quote-only mode.
4. In `surchargePriceComponentSource`, return `ONYX_POLY_H3_SOURCE` for the exact new surcharge ID.
5. Parent's quote-only fixture must verify real 92×71 / 69×71 opening-to-priced-footprint conversions. Local tests use explicit 50 and 39-square-foot billing footprints to independently assert $1,590 and $2,458 for quantity two.

Validation: 69 targeted pricing/catalog/H3 tests, plus TypeScript. No push, deployment, native quote mutation or account-cost substitution was performed by this increment.
