# Norman July 2026 Retail Guide Audit

## Source

- File: `2026Jul Retail Price Guide (1).pdf`
- Document title: `2026 Retail Guide Effective July 1st, 2026`
- Revision: `2026-07`
- Effective date: `2026-07-01`
- PDF creation/modification date: `2026-06-15`
- Received: `2026-07-20`
- Pages: 40
- SHA-256: `ae102c19b833e5c20070c11ecaad61d68a79bf6b52b5402fad55415e2602d2f3`
- Price basis: suggested retail, except page 4 freight/oversize charges marked `NET`
- Dealer factor supplied by 805 Shutters: `0.30` of suggested retail

`scripts/audit-and-enrich-norman-catalog.py` verifies every complete grid row against the PDF text layer before it will update catalog provenance. The July audit matched all 321 grid rows and every explicit `NA` cell. All 40 rendered pages were also visually reviewed.

## Product Coverage

| Product | PDF pages | Programs |
| --- | ---: | ---: |
| Portrait Honeycomb Shades | 9-12 | 7 |
| Portrait Vertical Honeycomb | 13-14 | 2 |
| Soluna Roller Shades | 15-20 | 6 |
| SmartFold Shades | 21 | 4 |
| PerfectSheer Shades | 22 | 1 |
| SmartDrape | 23-24 | 2 |
| Centerpiece Roman Shades | 25-27 | 4 |
| Ultimate Cordless Faux Wood Blinds | 30 | 1 |
| SmartPrivacy Cordless Faux Wood Blinds | 31 | 1 |
| Ultimate Normandy Cordless Wood Blinds | 32-33 | 1 |
| Synchrony Vertical Blinds | 34 | 4 |
| CityLights Cordless Aluminum Blinds | 35 | 1 |
| Palladian Window Shelf | 36-37 | 2 |

The catalog also represents all listed product surcharges, width-graduated valances, Smart Motorization (pages 6-7), AutoWand (page 8), and Automate Home (page 28).

## Corrected Rules

- Every Norman guide product and retail surcharge calculates internal dealer cost as `retail x 0.30`. Customer retail remains the published guide amount.
- Page 4 freight and oversize charges are dealer-net costs and are not multiplied by `0.30` or added to customer retail.
- Freight for blinds and shades is `$25` for the first physical unit and `$11` for each additional unit.
- Widths of 90 inches or more incur net oversize of `$80` for the first unit and `$50` for each additional unit.
- Vertical blinds, vertical honeycomb, Light Guard products, framed shades, and motorized honeycomb skylights apply oversize to both width and height. Coupled configurations are capped at two oversize units.
- Dual Roller pricing is two grid bases plus the `$73` surcharge. Its drive motor is also charged twice.
- Coupled Roller pricing is the selected number of grid bases plus `$117` for each join: one surcharge for two shades, two for three, and three for four.
- LightGuard 360 pricing uses the selected number of individual grid bases and `$375` per individual shade, plus the `$150` T-post.
- SmartFit Dual pricing uses two honeycomb grid bases plus the applicable `$178` or `$382` surcharge.
- Day & Night Roman motorization uses two single-motor surcharges.
- SmartSense is `$60` and available only for Soluna Roller and SmartFold. `NA` product columns return an explicit error.
- SmartFold does not offer Automate Home. SmartDrape offers Smart Motorization only. Vertical Honeycomb and Synchrony Vertical do not receive motor families not listed by the guide.

## Golden Amounts

| Configuration | Source calculation | Retail | Dealer product cost |
| --- | --- | ---: | ---: |
| Honeycomb 9/16 cordless, 24 x 36 | PDF p10, cell 24 x 36 | $212.00 | $63.60 |
| Roller Callie PG1, 24 x 36 | PDF p18, cell 24 x 36 | $254.00 | $76.20 |
| Dual Roller Callie, 24 x 36 | `(254 x 2) + 73`, PDF pp18,20 | $581.00 | $174.30 |
| Three coupled Rollers, 24 x 36 | `(254 x 3) + (117 x 2)`, PDF pp18,20 | $996.00 | $298.80 |
| SmartFit Dual Honeycomb, 24 x 36 | `(212 x 2) + 178`, PDF p10 | $602.00 | $180.60 |
| Dual Roller with Smart motor and SmartDial | `508 + 73 + (482 x 2) + 268`, PDF pp7,18,20 | $1,813.00 | $543.90 |
| Three coupled Rollers, order-level freight | `25 + (11 x 2)`, PDF p4 | unchanged | +$47.00 net |
| Four coupled Rollers at 90+ inches | `80 + 50`, capped at two, PDF p4 | unchanged | +$130.00 net |

## Source Limits And Uncertainties

- This retail guide contains no Norman shutter product grids or shutter option prices. Existing Norman shutter pricing remains provisional and is not assigned the `0.30` factor from this book. Page 4 shutter freight rules are retained separately.
- The smallest grid cell is treated as the minimum billable cell. The guide does not state every technical minimum dimension.
- Individual fabric/color availability comes from the existing Norman product/color sources. This guide verifies collection-to-price-group routing, not every individual color SKU.
- Palladian Shelf freight classification is not defined. Its landed cost remains incomplete rather than assuming blinds-and-shades freight.
- Commercial Solutions on page 39 says special pricing is available at quantity thresholds but provides no amounts. No commercial discount is applied.
- Shutter oversize exclusions for cafe shutters and specialty shapes are not defined; those configurations require manual cost review.
- HI/AK rates from page 4 are applied when `shipping_region` is explicitly `hi_ak`. A quote mixing continental-US and HI/AK destinations remains incomplete rather than silently choosing either schedule.
