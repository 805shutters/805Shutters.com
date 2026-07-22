# Polar Shades Quote Lab Catalog

## Source

- File: `Polar-Shades-Dealer-Book-CURRENT.pdf`
- PDF title: `Microsoft Word - 2019 Polar Dealer Book (Repaired)`
- Revision: `CURRENT`
- Effective date: undefined; the book does not publish one
- Modified: 2026-07-18
- Received: 2026-07-20
- Pages: 246
- SHA-256: `52eb859d583174c311e9682a09da3c33f8d081b2e772866a40dc025e2dcd0b0e`
- Price basis: suggested retail, except page 88 All Seasons net pricing
- Dealer factor supplied with the book: `0.45`

The source PDF is not committed because it is 104 MB. `scripts/generate-polar-catalog.py`
reproduces `polar-shades.catalog.json` from the received PDF and preserves source-page
references. The document's effective date remains `null`; `CURRENT` is a revision label,
not an inferred date.

## Coverage

| Product/system | Source pages | Catalog coverage |
| --- | ---: | --- |
| Interior Roller | 12-53 | 14 complete grids, 176 fabrics, openness, roll widths, railroad limits, fascia, cassette, head pocket, side channel, hem bar, clutch, cordless, bottom-up, coupled/duo, RAL, motors, controls, cables, power |
| Motorized Drapery Track | 74-77 | Pinch pleat and white/bronze Ripple Fold variants, 48-432 inch grids, brackets, bends, packaging, motors, modules and accessories |
| Motorized Tension Shade | 84-86 | Product/specification represented; pricing blocked |
| All Seasons Retractable Screen | 88 | Single/double and sliding-door dealer-net amounts represented; customer pricing blocked |
| Elite Patio | 90-106 | Groups 1-10, 48 exterior fabrics, cassette/pocket, guides, Vortex, RAL, motors and controls |
| Titan Patio | 113-130 | Groups 1-10, 48 exterior fabrics, hood/cassette/pocket, guides, Vortex, RAL, motors and controls |
| Mega Exterior | 140-157 | Groups 1-10, 48 exterior fabrics, hood/cassette, guides, width-dependent Vortex limits, RAL, motors and controls |
| Premium Pro Awning | 165, 173, 176-177 | Width/projection grid, motors, controls, sensors, cables, LED, recover rules |
| Premium Plus Awning | 167, 173, 176-177 | Width/projection grid, motors, controls, sensors, cables, LED, recover rules |
| Premium Awning | 169, 173, 176-177 | Width/projection grid, drop valance, motors, controls, LED, recover rules |
| Select Awning | 171, 173, 176-177 | Grid through 23 ft, technical maximum 40 ft, hood/drop valance, controls, LED, recover rules |
| Drop Arm Window Awning | 178 | Width/projection grid, cassette and published motors |
| Exterior Clutch Roller | bookmarks/warranty only | Explicitly unavailable; no usable product or price section |

Pages 179-246 are manufacturer component and technical-reference pages, not separate
customer product families. Their priced controls/components are associated with the
applicable systems; unpriced technical specifications are retained as notes rather than
invented quote charges.

## Golden Amounts

All values below are asserted in `pricing.polar.test.ts`. Dealer cost is internal and is
not returned by the browser catalog.

| Case | Source coordinate and calculation | Expected retail | Expected dealer cost |
| --- | --- | ---: | ---: |
| Interior minimum | p26, group 1, 24 x 36 | $110.00 | $49.50 |
| Between-grid | p26, group 1, 25 x 37 rounds to 30 x 42 | $134.00 | $60.30 |
| Interior typical | p28, group 3, 50 x 70 rounds to 54 x 72 | $282.00 | $126.90 |
| Quantity four | $282 x 4 | $1,128.00 | $507.60 |
| Interior maximum | p39, group 14, 288 x 168 | $19,043.00 | $8,569.35 |
| Manual accessories | p26: base $110 + side channels $77 + bottom-up $275 + 3-inch fascia $44 | $506.00 | $227.70 |
| Interior 506 Standard | p40/42: base $110 + motor $561 | $671.00 | $301.95 |
| Elite 510 Altus | p96/p102: base $415 + motor $907 | $1,322.00 | $594.90 |
| Titan 525 Altus | p120/p126: base $635 + motor $898 | $1,533.00 | $689.85 |
| Mega 525 Altus | p147/p153: base $3,268 + motor $907 | $4,175.00 | $1,878.75 |
| Drapery Glydea 60 RTS | p74/p77: track $472 + motor $1,345 | $1,817.00 | $817.65 |
| Titan typical | p123, group 7, 130 x 130 rounds to 132 x 132 | $2,653.00 | $1,193.85 |
| Mega typical | p147, group 2, 250 x 107 rounds to 252 x 108 | $4,430.00 | $1,993.50 |
| Premium Pro | p165, 10 ft x 6 ft 11 in | $4,900.00 | $2,205.00 |
| Select | p171, 100 x 102 rounds to 9 ft x 8 ft 6 in | $3,105.00 | $1,397.25 |
| Drop Arm | p178, 37 x 40 rounds to 4 ft x 3 ft 11 in | $1,136.00 | $511.20 |
| Elite custom RAL | p96/p157: $415 + $1,500 undiscounted RAL | $1,915.00 | $1,686.75 |
| Forty-line quote | p26 minimum: 40 x $110 | $4,400.00 | $1,980.00 |

## Blocking And Uncertainties

- Tension Shade returns `MANUAL_PRICE_REQUIRED`; pages 84-86 have specifications but no complete retail grid.
- All Seasons returns `CUSTOMER_RETAIL_UNDEFINED`; page 88 explicitly states net pricing and no dealer discount.
- Exterior Clutch returns `PRODUCT_UNAVAILABLE`; no usable product/pricing section exists.
- Select widths above 23 ft return a width error. The technical maximum is 40 ft, but the source says to contact Polar for price.
- Missing manufacturer/product returns `PRODUCT_SELECTION_REQUIRED` for shared Roller Shades and Awnings.
- Missing, unavailable, and blank cells return `NA_CELL`; no neighboring group or cheaper cell is substituted.
- Unpriced custom frame colors and printed shades return `SURCHARGE_NO_PRICE` when selected.
- Freight, packaging exceptions, residential delivery, and out-of-area delivery have no published amount. Successful quotes carry an internal incomplete-cost warning; no amount is invented.
- The source does not define a customer-retail policy for dealer-net products. Those totals stay blocked until an explicit policy is supplied.

## Isolation

The Quote Lab uses its session-only database adapter. Production data, quote sending,
payments, and manufacturer ordering remain disabled. Polar controls render only when
the quote-builder database provider has `isolated=true`.
