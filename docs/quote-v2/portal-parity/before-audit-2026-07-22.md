# 805 Quote V2 manufacturer pricing parity — BEFORE correction

Generated from `quote-v2-portal-parity-before-2026-07-22`. This report preserves the untouched output from Git revision `0dd77d068746874ce8326a1350fe9eeb1947cf09`; it contains no AFTER values and documents no pricing correction.

Route: `/quote-lab/`  
Interface marker: `exact-existing-builder`  
Backend adapter: `repriceExactQuoteBuilderForQuoteLabPreview`  
Injected catalog date: `2026-08-01`  
Capture time: `2026-07-22T16:25:00Z`

No customer quote was sent, no manufacturer order was submitted, and no production data was written.

## Side-by-side BEFORE results

| Manufacturer | Product | Configuration | Manufacturer base | Manufacturer options | Manufacturer MSRP | 805 base | 805 options | 805 BEFORE total | Difference | Difference % | Result | Verification |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Norman | Soluna Roller Shades | 24 x 36 x 1: Inside mount; Brook F1120 Pewter; SmartRelease; 1 3/4-inch tube; no top treatment; one shim | $254.00 | $96.00 | $350.00 | $209.55 | $79.20 | $288.75 | -$61.25 | 17.50% | FAIL | portal_verified |
| Norman | Synchrony Vertical Blinds | 24 x 48 x 1: Outside mount; Classic Pure White; left stack; left draw; standard operation | $204.00 | $0.00 | $204.00 | $168.30 | $0.00 | $168.30 | -$35.70 | 17.50% | FAIL | official_price_book_verified |
| Norman | Centerpiece Roman Shades | 96 x 72 x 1: Outside mount; Scarlett F1599 Cottage Linen; Flat Fold with Batten Back; Continuous Cord Loop with 2-inch headrail; unlined; non-railroaded; no seams | $2,306.00 | $0.00 | $2,306.00 | $1,902.45 | $0.00 | $1,902.45 | -$403.55 | 17.50% | FAIL | official_price_book_verified |
| Polar | Polar Elite Patio | 88 x 67 x 1: Exterior Elite track shade; SunTex 90 10%; manual gear/crank; standard non-zipper tracks; no valance; railroad and seam; 92 x 67 x 1: Exterior Elite track shade; SunTex 90 10%; manual gear/crank; standard non-zipper tracks; no valance; railroad and seam; 85.5 x 67 x 1: Exterior Elite track shade; SunTex 90 10%; manual gear/crank; standard non-zipper tracks; no valance; railroad and seam | $2,517.00 | $198.00 | $2,715.00 | $3,243.39 | $0.00 | $3,243.39 | $528.39 | 19.46% | FAIL | portal_verified_with_official_book_conflict |
| Polar | Polar Motorized Drapery Track | 48 x 96 x 1: Pinch pleat; split draw; white track; base configuration only | $472.00 | $0.00 | $472.00 | $0.00 | $0.00 | $0.00 | -$472.00 | 100.00% | FAIL | official_price_book_verified |
| Polar | Polar Premium Pro Awning | 120 x 83 x 1: Premium Pro base grid at the minimum listed 120-inch width and 83-inch projection | $4,900.00 | $0.00 | $4,900.00 | $0.00 | $0.00 | $0.00 | -$4,900.00 | 100.00% | FAIL | official_price_book_verified |
| Lotus | Lotus Aluminum Mini Blinds | 17 x 36 x 1: Custom-cut 1-inch aluminum mini blind; base dealer matrix cell | MSRP unverified | MSRP unverified | MSRP unverified | $53.70 | $0.00 | $53.70 | — | — | UNVERIFIED | official_dealer_book_verified_msrp_unverified |
| Lotus | Lotus Faux Wood Blinds | 17 x 36 x 1: Custom-cut 2-inch smooth faux wood; Bright White; base dealer matrix cell | MSRP unverified | MSRP unverified | MSRP unverified | $58.93 | $0.00 | $58.93 | — | — | UNVERIFIED | official_dealer_book_verified_msrp_unverified |
| Lotus | Lotus Vertical Blinds | 35 x 48 x 1: Custom-cut 3.5-inch complete steel vertical; base dealer matrix cell | MSRP unverified | MSRP unverified | MSRP unverified | $79.93 | $0.00 | $79.93 | — | — | UNVERIFIED | official_dealer_book_verified_msrp_unverified |
| Onyx | Onyx Shutters | 36 x 48 x 1: 12 square feet; outside mount; LR two-panel layout; 3.5-inch louvers; standard tilt; white; final frame-to-frame dimensions | MSRP unverified | MSRP unverified | MSRP unverified | $0.00 | $0.00 | $0.00 | — | — | UNVERIFIED | dealer_evidence_verified_msrp_unverified |

Failure threshold: more than $1.00 or 0.25%. MSRP-unverified cases are never labeled pass.

## Detailed BEFORE evidence

### Norman — Soluna Roller Shades

Test: `norman-roller-smartrelease-24x36`  
Classification: `portal_verified`  
Product/program: `roller` / `roller_cordless_fabric_price_group_1_pg1`  
Source: `norman-retail-guide-2026-07`, page(s) 18, 20

Selections:
- Line 1: 24 x 36; quantity 1; Inside mount; Brook F1120 Pewter; SmartRelease; 1 3/4-inch tube; no top treatment; one shim

MANUFACTURER SYSTEM OUTPUT
- official_msrp [customer_retail; portal_verified]
  - 24 x 36 PG1 base: $254.00 (base_grid)
  - SmartRelease: $89.00 (operating_system)
  - Shim: $7.00 (accessory)
  - Subtotal: $350.00
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $350.00
- portal_dealer [dealer_cost; portal_verified]
  - Portal-rounded base: $83.82 (base_grid)
  - Portal-rounded grouped SmartRelease and shim: $31.68 (other)
  - Subtotal: $115.50
  - Freight: $25.00
  - Processing: $2.81
  - Tax: $0.00
  - Grand total: $143.31

805 QUOTING SYSTEM OUTPUT — BEFORE CORRECTION
- Status: priced
- Product/validation status: documented_limited / valid
- Sendable: yes
- Base grid: $209.55 (base_grid)
- PG1 fabric included: $0.00 (fabric_upgrade)
- SmartRelease: $73.43 (operating_system)
- Shim: $5.77 (accessory)
- Customer retail subtotal: $288.75
- Displayed total: $288.75
- Internal product cost: $115.50
- Internal freight: $25.00
- Internal oversize: $0.00
- Internal processing: $2.81
- Internal landed cost: $143.31

DIFFERENCE
- MANUFACTURER SAID: $350.00
- 805 SAID BEFORE CORRECTION: $288.75
- Difference: -$61.25 / 17.50%
- Result: FAIL
- Exact discrepancy start: The 805 base component starts from current dealer net and then applies 2.5 instead of preserving the official $254 MSRP base.
- Suspected cause: Manufacturer-specific MSRP method is replaced by dealer-net x2.5.

### Norman — Synchrony Vertical Blinds

Test: `norman-synchrony-vertical-24x48`  
Classification: `official_price_book_verified`  
Product/program: `synchrony_vertical` / `synchrony_vertical_synchrony_vertical_blind_price_group_1_pg1`  
Source: `norman-retail-guide-2026-07`, page(s) 34

Selections:
- Line 1: 24 x 48; quantity 1; Outside mount; Classic Pure White; left stack; left draw; standard operation

MANUFACTURER SYSTEM OUTPUT
- official_msrp [customer_retail; official_price_book_verified]
  - 24 x 48 PG1 base: $204.00 (base_grid)
  - Subtotal: $204.00
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $204.00

805 QUOTING SYSTEM OUTPUT — BEFORE CORRECTION
- Status: priced
- Product/validation status: complete / valid
- Sendable: yes
- Base grid: $168.30 (base_grid)
- PG1 fabric included: $0.00 (fabric_upgrade)
- Standard operation included: $0.00 (operating_system)
- No accessories: $0.00 (accessory)
- Customer retail subtotal: $168.30
- Displayed total: $168.30
- Internal product cost: $67.32
- Internal freight: $25.00
- Internal oversize: $0.00
- Internal processing: $1.85
- Internal landed cost: $94.17

DIFFERENCE
- MANUFACTURER SAID: $204.00
- 805 SAID BEFORE CORRECTION: $168.30
- Difference: -$35.70 / 17.50%
- Result: FAIL
- Exact discrepancy start: The $204 official MSRP base becomes $168.30 in the 805 customer ledger.
- Suspected cause: Manufacturer-specific MSRP is replaced by current dealer net x2.5.
- Limitations:
  - Portal parity is not claimed; this is an official-price-book comparison.

### Norman — Centerpiece Roman Shades

Test: `norman-roman-large-96x72`  
Classification: `official_price_book_verified`  
Product/program: `roman` / `roman_cordless_usa_price_group_1_pg1`  
Source: `norman-retail-guide-2026-07`, page(s) 26

Selections:
- Line 1: 96 x 72; quantity 1; Outside mount; Scarlett F1599 Cottage Linen; Flat Fold with Batten Back; Continuous Cord Loop with 2-inch headrail; unlined; non-railroaded; no seams

MANUFACTURER SYSTEM OUTPUT
- official_msrp [customer_retail; official_price_book_verified]
  - 96 x 72 PG1 base: $2,306.00 (base_grid)
  - Subtotal: $2,306.00
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $2,306.00

805 QUOTING SYSTEM OUTPUT — BEFORE CORRECTION
- Status: priced_but_send_blocked
- Product/validation status: documented_limited / blocked
- Sendable: no
- Base grid: $1,902.45 (base_grid)
- PG1 fabric included: $0.00 (fabric_upgrade)
- Continuous Cord Loop included: $0.00 (operating_system)
- No accessories: $0.00 (accessory)
- Customer retail subtotal: $1,902.45
- Displayed total: $1,902.45
- Internal product cost: $760.98
- Internal freight: $25.00
- Internal oversize: $80.00
- Internal processing: $15.72
- Internal landed cost: $881.70
- Block/error: Norman processing-fee treatment for an oversize charge is not source-verified.

DIFFERENCE
- MANUFACTURER SAID: $2,306.00
- 805 SAID BEFORE CORRECTION: $1,902.45
- Difference: -$403.55 / 17.50%
- Result: FAIL
- Exact discrepancy start: The $2,306 official MSRP base becomes $1,902.45 before the separate send block.
- Suspected cause: Manufacturer-specific MSRP is replaced by current dealer net x2.5; oversize processing scope is independently unresolved.
- Limitations:
  - The customer price exists, but the quote is not sendable because oversize processing-fee scope is unverified.

### Polar — Polar Elite Patio

Test: `polar-elite-suntex90-manual-three-line`  
Classification: `portal_verified_with_official_book_conflict`  
Product/program: `polar_elite_patio` / `group_4`  
Source: `polar-shades-dealer-book-current-2026-07-18`, page(s) 97

Selections:
- Line 1: 88 x 67; quantity 1; Exterior Elite track shade; SunTex 90 10%; manual gear/crank; standard non-zipper tracks; no valance; railroad and seam
- Line 2: 92 x 67; quantity 1; Exterior Elite track shade; SunTex 90 10%; manual gear/crank; standard non-zipper tracks; no valance; railroad and seam
- Line 3: 85.5 x 67; quantity 1; Exterior Elite track shade; SunTex 90 10%; manual gear/crank; standard non-zipper tracks; no valance; railroad and seam

MANUFACTURER SYSTEM OUTPUT
- portal_msrp [customer_retail; portal_verified]
  - 88 x 67 portal base: $839.00 (base_grid)
  - 88 x 67 Titan - Tracks: $66.00 (accessory)
  - 92 x 67 portal base: $839.00 (base_grid)
  - 92 x 67 Titan - Tracks: $66.00 (accessory)
  - 85.5 x 67 portal base: $839.00 (base_grid)
  - 85.5 x 67 Titan - Tracks: $66.00 (accessory)
  - Subtotal: $2,715.00
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $2,715.00
- official_book_msrp [customer_retail; official_price_book_verified]
  - 88 x 67 rounded to the book's 96 x 72 Group 4 cell: $961.00 (base_grid)
  - 92 x 67 rounded to the book's 96 x 72 Group 4 cell: $961.00 (base_grid)
  - 85.5 x 67 rounded to the book's 96 x 72 Group 4 cell: $961.00 (base_grid)
  - Subtotal: $2,883.00
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $2,883.00
- portal_dealer [dealer_cost; portal_verified]
  - Portal dealer unit: $407.25 (base_grid)
  - Portal dealer unit: $407.25 (base_grid)
  - Portal dealer unit: $407.25 (base_grid)
  - Subtotal: $1,221.75
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $94.69
  - Grand total: $1,316.44
- official_book_dealer_factor [dealer_cost; official_price_book_verified]
  - $961 x .45: $432.45 (base_grid)
  - $961 x .45: $432.45 (base_grid)
  - $961 x .45: $432.45 (base_grid)
  - Subtotal: $1,297.35
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $1,297.35

805 QUOTING SYSTEM OUTPUT — BEFORE CORRECTION
- Status: priced_but_send_blocked
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- 805 customer unit: $1,081.13 (base_grid)
- 805 customer unit: $1,081.13 (base_grid)
- 805 customer unit: $1,081.13 (base_grid)
- Customer retail subtotal: $3,243.39
- Displayed total: $3,243.39
- Internal product cost: $1,297.35
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $1,297.35
- Block/error: Polar Elite restriction evidence and freight remain incomplete, so the calculated price is not customer-sendable.

DIFFERENCE
- MANUFACTURER SAID: $2,715.00
- 805 SAID BEFORE CORRECTION: $3,243.39
- Difference: $528.39 / 19.46%
- Result: FAIL
- Exact discrepancy start: Each portal $905 configured list unit becomes $1,081.13 in the 805 customer ledger.
- Suspected cause: The current engine applies the book's .45 dealer factor and then 2.5, while the exact portal route also conflicts with the book's Group 4 base and separately identifies a $66 track component.
- Limitations:
  - The live portal and pinned book conflict for this exact route; the option remains quarantined until that source conflict is resolved.
  - Portal list and dealer figures are preserved separately from the conflicting official-book ledger.

### Polar — Polar Motorized Drapery Track

Test: `polar-drapery-pinch-split-white-48`  
Classification: `official_price_book_verified`  
Product/program: `polar_drapery_track` / `pinch_split_white`  
Source: `polar-shades-dealer-book-current-2026-07-18`, page(s) 74

Selections:
- Line 1: 48 x 96; quantity 1; Pinch pleat; split draw; white track; base configuration only

MANUFACTURER SYSTEM OUTPUT
- official_msrp [customer_retail; official_price_book_verified]
  - 48-inch Pinch Pleat Split White: $472.00 (base_grid)
  - Subtotal: $472.00
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $472.00
- official_book_dealer_factor [dealer_cost; official_price_book_verified]
  - $472 x .45: $212.40 (base_grid)
  - Subtotal: $212.40
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $212.40

805 QUOTING SYSTEM OUTPUT — BEFORE CORRECTION
- Status: unpriceable
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- Customer retail subtotal: $0.00
- Displayed total: $0.00
- Internal product cost: $0.00
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $0.00
- Block/error: A price-group program requires one unambiguous explicit pricing family and baseline program.
- Non-authoritative diagnostic only: source/list $472.00, dealer $212.40, projected customer $531.00. Raw catalog arithmetic only; the authoritative component engine rejected the configuration.

DIFFERENCE
- MANUFACTURER SAID: $472.00
- 805 SAID BEFORE CORRECTION: $0.00
- Difference: -$472.00 / 100.00%
- Result: FAIL
- Exact discrepancy start: The authoritative 805 component engine returns no base component or customer total.
- Suspected cause: Missing pricing-family and baseline metadata, followed by incomplete product restrictions.
- Limitations:
  - Official-price-book verified only; no portal parity claim.

### Polar — Polar Premium Pro Awning

Test: `polar-premium-pro-awning-120x83`  
Classification: `official_price_book_verified`  
Product/program: `polar_awning_premium_pro` / `standard`  
Source: `polar-shades-dealer-book-current-2026-07-18`, page(s) 165

Selections:
- Line 1: 120 x 83; quantity 1; Premium Pro base grid at the minimum listed 120-inch width and 83-inch projection

MANUFACTURER SYSTEM OUTPUT
- official_msrp [customer_retail; official_price_book_verified]
  - 120 x 83 Premium Pro: $4,900.00 (base_grid)
  - Subtotal: $4,900.00
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $4,900.00
- official_book_dealer_factor [dealer_cost; official_price_book_verified]
  - $4,900 x .45: $2,205.00 (base_grid)
  - Subtotal: $2,205.00
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $2,205.00

805 QUOTING SYSTEM OUTPUT — BEFORE CORRECTION
- Status: unpriceable
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- Customer retail subtotal: $0.00
- Displayed total: $0.00
- Internal product cost: $0.00
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $0.00
- Block/error: A price-group program requires one unambiguous explicit pricing family and baseline program.
- Non-authoritative diagnostic only: source/list $4,900.00, dealer $2,205.00, projected customer $5,512.50. Raw catalog arithmetic only; the authoritative component engine rejected the configuration.

DIFFERENCE
- MANUFACTURER SAID: $4,900.00
- 805 SAID BEFORE CORRECTION: $0.00
- Difference: -$4,900.00 / 100.00%
- Result: FAIL
- Exact discrepancy start: The authoritative 805 component engine returns no base component or customer total.
- Suspected cause: Missing pricing-family and baseline metadata, followed by incomplete product restrictions.
- Limitations:
  - Official-price-book verified only; no portal parity claim.

### Lotus — Lotus Aluminum Mini Blinds

Test: `lotus-mini-aluminum-17x36`  
Classification: `official_dealer_book_verified_msrp_unverified`  
Product/program: `lotus_mini_blinds` / `lotus_amx_1in_aluminum_custom`  
Source: `lotus-west-a26-v1`, page(s) 97

Selections:
- Line 1: 17 x 36; quantity 1; Custom-cut 1-inch aluminum mini blind; base dealer matrix cell

MANUFACTURER SYSTEM OUTPUT
- official_dealer_net [dealer_cost; official_dealer_book_verified]
  - 17 x 36 dealer matrix: $21.48 (base_grid)
  - Subtotal: $21.48
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $21.48

805 QUOTING SYSTEM OUTPUT — BEFORE CORRECTION
- Status: priced_but_send_blocked
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- Dealer-net base converted by current 805 policy: $53.70 (base_grid)
- Customer retail subtotal: $53.70
- Displayed total: $53.70
- Internal product cost: $21.48
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $21.48
- Block/error: Lotus restriction evidence remains incomplete and customer MSRP is not source-defined.

DIFFERENCE
- MANUFACTURER SAID: MSRP unverified
- 805 SAID BEFORE CORRECTION: $53.70
- Difference: not comparable
- Result: UNVERIFIED
- Exact discrepancy start: No manufacturer MSRP exists in the supplied source, so $53.70 cannot be compared to like-for-like manufacturer retail.
- Suspected cause: The current engine projects customer retail from dealer net using 2.5 without a manufacturer-specific MSRP source.
- Limitations:
  - Dealer cost is verified; customer MSRP is not.

### Lotus — Lotus Faux Wood Blinds

Test: `lotus-faux-wood-bright-white-17x36`  
Classification: `official_dealer_book_verified_msrp_unverified`  
Product/program: `lotus_faux_wood_blinds` / `lotus_flx_2in_bright_white_custom`  
Source: `lotus-west-a26-v1`, page(s) 99

Selections:
- Line 1: 17 x 36; quantity 1; Custom-cut 2-inch smooth faux wood; Bright White; base dealer matrix cell

MANUFACTURER SYSTEM OUTPUT
- official_dealer_net [dealer_cost; official_dealer_book_verified]
  - 17 x 36 dealer matrix: $23.57 (base_grid)
  - Subtotal: $23.57
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $23.57

805 QUOTING SYSTEM OUTPUT — BEFORE CORRECTION
- Status: priced_but_send_blocked
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- Dealer-net base converted by current 805 policy: $58.93 (base_grid)
- Customer retail subtotal: $58.93
- Displayed total: $58.93
- Internal product cost: $23.57
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $23.57
- Block/error: Lotus restriction evidence remains incomplete and customer MSRP is not source-defined.

DIFFERENCE
- MANUFACTURER SAID: MSRP unverified
- 805 SAID BEFORE CORRECTION: $58.93
- Difference: not comparable
- Result: UNVERIFIED
- Exact discrepancy start: No manufacturer MSRP exists in the supplied source, so $58.93 cannot be compared to like-for-like manufacturer retail.
- Suspected cause: The current engine projects customer retail from dealer net using 2.5 without a manufacturer-specific MSRP source.
- Limitations:
  - Dealer cost is verified; customer MSRP is not.
  - This is a separate product type but not a portal-verified option-heavy configuration because no authenticated Lotus portal evidence was available.

### Lotus — Lotus Vertical Blinds

Test: `lotus-steel-vertical-35x48`  
Classification: `official_dealer_book_verified_msrp_unverified`  
Product/program: `lotus_vertical_blinds` / `lotus_cv_steel_complete_custom`  
Source: `lotus-west-a26-v1`, page(s) 106

Selections:
- Line 1: 35 x 48; quantity 1; Custom-cut 3.5-inch complete steel vertical; base dealer matrix cell

MANUFACTURER SYSTEM OUTPUT
- official_dealer_net [dealer_cost; official_dealer_book_verified]
  - 35 x 48 dealer matrix: $31.97 (base_grid)
  - Subtotal: $31.97
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $31.97

805 QUOTING SYSTEM OUTPUT — BEFORE CORRECTION
- Status: priced_but_send_blocked
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- Dealer-net base converted by current 805 policy: $79.93 (base_grid)
- Customer retail subtotal: $79.93
- Displayed total: $79.93
- Internal product cost: $31.97
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $31.97
- Block/error: Lotus restriction evidence remains incomplete and customer MSRP is not source-defined.

DIFFERENCE
- MANUFACTURER SAID: MSRP unverified
- 805 SAID BEFORE CORRECTION: $79.93
- Difference: not comparable
- Result: UNVERIFIED
- Exact discrepancy start: No manufacturer MSRP exists in the supplied source, so $79.93 cannot be compared to like-for-like manufacturer retail.
- Suspected cause: The current engine projects customer retail from dealer net using 2.5 without a manufacturer-specific MSRP source.
- Limitations:
  - Dealer cost is verified; customer MSRP is not.
  - The available third Lotus product is not a genuinely large test at this cell; no unsupported size was invented.

### Onyx — Onyx Shutters

Test: `onyx-us-made-vinyl-36x48`  
Classification: `dealer_evidence_verified_msrp_unverified`  
Product/program: `onyx_shutters` / `onyx_us_made_vinyl`  
Source: `onyx-price-screenshot-2026-07-20`

Selections:
- Line 1: 36 x 48; quantity 1; 12 square feet; outside mount; LR two-panel layout; 3.5-inch louvers; standard tilt; white; final frame-to-frame dimensions

MANUFACTURER SYSTEM OUTPUT
- dealer_cost_evidence [dealer_cost; user_supplied_pricing_evidence]
  - 12 sq ft x $13.60: $163.20 (base_grid)
  - Subtotal: $163.20
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $163.20

805 QUOTING SYSTEM OUTPUT — BEFORE CORRECTION
- Status: unpriceable
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- Customer retail subtotal: $0.00
- Displayed total: $0.00
- Internal product cost: $0.00
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $0.00
- Block/error: The supplied binder documents only generic Vinyl and does not establish U.S. Made Vinyl restrictions.
- Non-authoritative diagnostic only: source/list MSRP unverified, dealer $163.20, projected customer $408.00. Existing 805 catalog policy is $34 per square foot; this is not manufacturer MSRP and V2 correctly blocks it.

DIFFERENCE
- MANUFACTURER SAID: MSRP unverified
- 805 SAID BEFORE CORRECTION: $0.00
- Difference: not comparable
- Result: UNVERIFIED
- Exact discrepancy start: No current Onyx restriction source or manufacturer MSRP supports a customer-retail comparison.
- Suspected cause: The only current price evidence is dealer cost; the restriction binder identifies generic Vinyl and is stale.
- Limitations:
  - Three genuinely different Onyx product types are impossible because the current system exposes one Onyx shutter family.
  - The $408 diagnostic is an 805 policy amount, not manufacturer MSRP.

## Coverage limitations

- Norman: 3 case(s), 3 distinct product(s), status `before_captured`.
- Polar: 3 case(s), 3 distinct product(s), status `before_captured`. Only the Elite case has exact portal evidence; Drapery Track and Premium Pro are official-price-book cases.
- Lotus: 3 case(s), 3 distinct product(s), status `msrp_unverified`. The supplied Lotus book exposes dealer-net amounts but no authoritative customer MSRP method.
- Onyx: 1 case(s), 1 distinct product(s), status `coverage_limited`. The current catalog supports one Onyx shutter product family, so three genuinely different Onyx product types cannot be tested without fabricating coverage.

## Evidence boundary

The tracked fixture and evidence receipt contain no credentials, customer PII, dealer-account number, portal session data, or full authenticated portal URL. The private Polar image is represented by its SHA-256 and a non-PII fact receipt. It is attached only to the exact Elite case and is not reused as evidence for unrelated Polar products.

