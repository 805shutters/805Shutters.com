# INTERNAL — 805 Quote V2 manufacturer pricing parity — AFTER correction

Correction revision: `fe4c1e7802a394929d8a17cf37592b51ea73c492`<br>
Immutable BEFORE capture: `quote-v2-portal-parity-before-2026-07-22` at revision `0dd77d068746874ce8326a1350fe9eeb1947cf09`<br>
Configured application route: `/quote-lab/` / `exact-existing-builder` / `v2`

The AFTER JSON is a source-controlled price-reconciliation expectation, not a manufacturer-portal capture. The permanent parity test independently replays source pricing through the authoritative runtime APIs and replays sendability through the existing-interface adapter. A hard-blocked exact configuration can therefore have a verified source-price reconciliation below while the adapter correctly exposes no customer total.

No manufacturer order was placed, no customer quote was sent, and no production data was changed. Portal evidence is used only for the exact configuration it proves; official-book and unverified cases remain labeled separately.

## Before-versus-after summary

| Manufacturer | Product | Manufacturer MSRP/list | 805 BEFORE | BEFORE difference | 805 AFTER | Remaining difference | Remaining % | Final result | Evidence |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| Norman | Soluna Roller Shades | $350.00 | $288.75 | -$61.25 | $350.00 | $0.00 | 0.00% | PASS | portal_verified |
| Norman | Synchrony Vertical Blinds | $204.00 | $168.30 | -$35.70 | $204.00 | $0.00 | 0.00% | PASS | official_price_book_verified |
| Norman | Centerpiece Roman Shades | $2,306.00 | $1,902.45 | -$403.55 | $2,306.00 | $0.00 | 0.00% | PASS | official_price_book_verified |
| Polar | Polar Elite Patio | $2,715.00 | $3,243.39 | +$528.39 | $2,883.00 | +$168.00 | 6.19% | FAIL | portal_verified_with_official_book_conflict |
| Polar | Polar Motorized Drapery Track | $472.00 | $0.00 | -$472.00 | $472.00 | $0.00 | 0.00% | PASS | official_price_book_verified |
| Polar | Polar Premium Pro Awning | $4,900.00 | $0.00 | -$4,900.00 | $4,900.00 | $0.00 | 0.00% | PASS | official_price_book_verified |
| Lotus | Lotus Aluminum Mini Blinds | MSRP unverified | $53.70 | not comparable | $64.44 | not comparable | — | UNVERIFIED | official_dealer_book_verified_msrp_unverified |
| Lotus | Lotus Faux Wood Blinds | MSRP unverified | $58.93 | not comparable | $70.71 | not comparable | — | UNVERIFIED | official_dealer_book_verified_msrp_unverified |
| Lotus | Lotus Vertical Blinds | MSRP unverified | $79.93 | not comparable | $95.91 | not comparable | — | UNVERIFIED | official_dealer_book_verified_msrp_unverified |
| Onyx | Onyx Shutters | MSRP unverified | $0.00 | not comparable | $0.00 | not comparable | — | UNVERIFIED | dealer_evidence_verified_msrp_unverified |

Pass threshold: no more than $1.00 and 0.25%. A case with no manufacturer MSRP remains UNVERIFIED, never PASS.

## Detailed exact-case reconciliation

### Norman — Soluna Roller Shades

Test: `norman-roller-smartrelease-24x36`<br>
Product/program: `roller` / `roller_cordless_fabric_price_group_1_pg1`<br>
Classification: `portal_verified`<br>
Source: `norman-retail-guide-2026-07`, page(s) 18, 20

Selections:
- Line 1: 24 x 36; quantity 1; Inside mount; Brook F1120 Pewter; SmartRelease; 1 3/4-inch tube; no top treatment; one shim

MANUFACTURER SYSTEM / OFFICIAL SOURCE OUTPUT
- official_msrp [customer_retail; portal_verified]
  - 24 x 36 PG1 base: $254.00 (base_grid)
  - SmartRelease: $89.00 (operating_system)
  - Shim: $7.00 (accessory)
  - Merchandise/customer subtotal: $350.00
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $350.00
- portal_dealer [dealer_cost; portal_verified]
  - Portal-rounded base: $83.82 (base_grid)
  - Portal-rounded grouped SmartRelease and shim: $31.68 (other)
  - Merchandise/customer subtotal: $115.50
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
- Grand/displayed total: $288.75
- Internal product cost: $115.50
- Internal freight: $25.00
- Internal oversize: $0.00
- Internal processing: $2.81
- Internal landed cost: $143.31

805 SOURCE-PRICE RECONCILIATION — AFTER CORRECTION
- Status: priced
- Product/validation status: documented_limited / valid
- Sendable: yes
- 24 x 36 PG1 base: $254.00 (base_grid)
- Brook PG1 fabric included: $0.00 (fabric_upgrade)
- SmartRelease: $89.00 (operating_system)
- Shim: $7.00 (accessory)
- Customer retail subtotal: $350.00
- Grand/displayed total: $350.00
- Internal product cost: $115.50
- Internal freight: $25.00
- Internal oversize: $0.00
- Internal processing: $2.81
- Internal landed cost: $143.31

BEFORE / AFTER RESULT
- MANUFACTURER SAID: $350.00
- 805 SAID BEFORE CORRECTION: $288.75
- 805 SAID AFTER CORRECTION: $350.00
- BEFORE difference: -$61.25 / 17.50%
- Remaining difference: $0.00 / 0.00%
- RESULT: PASS
- Exact discrepancy/root cause: 805 began with dealer merchandise cost and multiplied it by 2.5, so the discrepancy started at the base and repeated on SmartRelease and the shim.
- Correction: Preserve Norman's $254 + $89 + $7 suggested-retail components; apply the account schedule only to the protected $115.50 dealer merchandise ledger.
- Remaining limitation: none for this exact pricing comparison

### Norman — Synchrony Vertical Blinds

Test: `norman-synchrony-vertical-24x48`<br>
Product/program: `synchrony_vertical` / `synchrony_vertical_synchrony_vertical_blind_price_group_1_pg1`<br>
Classification: `official_price_book_verified`<br>
Source: `norman-retail-guide-2026-07`, page(s) 34

Selections:
- Line 1: 24 x 48; quantity 1; Outside mount; Classic Pure White; left stack; left draw; standard operation

MANUFACTURER SYSTEM / OFFICIAL SOURCE OUTPUT
- official_msrp [customer_retail; official_price_book_verified]
  - 24 x 48 PG1 base: $204.00 (base_grid)
  - Merchandise/customer subtotal: $204.00
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
- Grand/displayed total: $168.30
- Internal product cost: $67.32
- Internal freight: $25.00
- Internal oversize: $0.00
- Internal processing: $1.85
- Internal landed cost: $94.17

805 SOURCE-PRICE RECONCILIATION — AFTER CORRECTION
- Status: priced
- Product/validation status: complete / valid
- Sendable: yes
- 24 x 48 PG1 base: $204.00 (base_grid)
- Classic PG1 fabric included: $0.00 (fabric_upgrade)
- Standard operation included: $0.00 (operating_system)
- Customer retail subtotal: $204.00
- Grand/displayed total: $204.00
- Internal product cost: $67.32
- Internal freight: $25.00
- Internal oversize: $0.00
- Internal processing: $1.85
- Internal landed cost: $94.17

BEFORE / AFTER RESULT
- MANUFACTURER SAID: $204.00
- 805 SAID BEFORE CORRECTION: $168.30
- 805 SAID AFTER CORRECTION: $204.00
- BEFORE difference: -$35.70 / 17.50%
- Remaining difference: $0.00 / 0.00%
- RESULT: PASS
- Exact discrepancy/root cause: The base $204 suggested retail was replaced by a cost-derived $168.30 customer amount.
- Correction: Use the exact $204 source retail grid cell and keep $67.32 merchandise cost separate.
- Remaining limitation: none for this exact pricing comparison

### Norman — Centerpiece Roman Shades

Test: `norman-roman-large-96x72`<br>
Product/program: `roman` / `roman_cordless_usa_price_group_1_pg1`<br>
Classification: `official_price_book_verified`<br>
Source: `norman-retail-guide-2026-07`, page(s) 26

Selections:
- Line 1: 96 x 72; quantity 1; Outside mount; Scarlett F1599 Cottage Linen; Flat Fold with Batten Back; Continuous Cord Loop with 2-inch headrail; unlined; non-railroaded; no seams

MANUFACTURER SYSTEM / OFFICIAL SOURCE OUTPUT
- official_msrp [customer_retail; official_price_book_verified]
  - 96 x 72 PG1 base: $2,306.00 (base_grid)
  - Merchandise/customer subtotal: $2,306.00
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
- Grand/displayed total: $1,902.45
- Internal product cost: $760.98
- Internal freight: $25.00
- Internal oversize: $80.00
- Internal processing: $15.72
- Internal landed cost: $881.70
- Block codes: `norman.processing_fee.oversize_scope_unverified`
- Block/error: Norman processing-fee treatment for an oversize charge is not source-verified.

805 SOURCE-PRICE RECONCILIATION — AFTER CORRECTION
- Status: priced_but_send_blocked
- Product/validation status: documented_limited / blocked
- Sendable: no
- 96 x 72 PG1 base: $2,306.00 (base_grid)
- Scarlett PG1 fabric included: $0.00 (fabric_upgrade)
- Continuous Cord Loop included: $0.00 (operating_system)
- Customer retail subtotal: $2,306.00
- Grand/displayed total: $2,306.00
- Internal product cost: $760.98
- Internal freight: $25.00
- Internal oversize: $80.00
- Internal processing: $15.72
- Internal landed cost: $881.70
- Block codes: `norman.processing_fee.oversize_scope_unverified`
- Block/error: Norman processing-fee treatment for an oversize charge is not source-verified.

BEFORE / AFTER RESULT
- MANUFACTURER SAID: $2,306.00
- 805 SAID BEFORE CORRECTION: $1,902.45
- 805 SAID AFTER CORRECTION: $2,306.00
- BEFORE difference: -$403.55 / 17.50%
- Remaining difference: $0.00 / 0.00%
- RESULT: PASS
- Exact discrepancy/root cause: The $2,306 retail grid cell was converted to a cost-derived $1,902.45 customer amount.
- Correction: Preserve the official $2,306 retail cell; keep dealer cost, freight, oversize, and processing in the protected ledger.
- Remaining limitation: Price parity passes, but sending stays blocked until Norman's processing-fee treatment of oversize charges is source-verified.

### Polar — Polar Elite Patio

Test: `polar-elite-suntex90-manual-three-line`<br>
Product/program: `polar_elite_patio` / `group_4`<br>
Classification: `portal_verified_with_official_book_conflict`<br>
Source: `polar-shades-dealer-book-current-2026-07-18`, page(s) 97

Selections:
- Line 1: 88 x 67; quantity 1; Exterior Elite track shade; SunTex 90 10%; manual gear/crank; standard non-zipper tracks; no valance; railroad and seam
- Line 2: 92 x 67; quantity 1; Exterior Elite track shade; SunTex 90 10%; manual gear/crank; standard non-zipper tracks; no valance; railroad and seam
- Line 3: 85.5 x 67; quantity 1; Exterior Elite track shade; SunTex 90 10%; manual gear/crank; standard non-zipper tracks; no valance; railroad and seam

MANUFACTURER SYSTEM / OFFICIAL SOURCE OUTPUT
- portal_msrp [customer_retail; portal_verified]
  - 88 x 67 portal base: $839.00 (base_grid)
  - 88 x 67 Titan - Tracks: $66.00 (accessory)
  - 92 x 67 portal base: $839.00 (base_grid)
  - 92 x 67 Titan - Tracks: $66.00 (accessory)
  - 85.5 x 67 portal base: $839.00 (base_grid)
  - 85.5 x 67 Titan - Tracks: $66.00 (accessory)
  - Merchandise/customer subtotal: $2,715.00
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $2,715.00
- official_book_msrp [customer_retail; official_price_book_verified]
  - 88 x 67 rounded to the book's 96 x 72 Group 4 cell: $961.00 (base_grid)
  - 92 x 67 rounded to the book's 96 x 72 Group 4 cell: $961.00 (base_grid)
  - 85.5 x 67 rounded to the book's 96 x 72 Group 4 cell: $961.00 (base_grid)
  - Merchandise/customer subtotal: $2,883.00
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $2,883.00
- portal_dealer [dealer_cost; portal_verified]
  - Portal dealer unit: $407.25 (base_grid)
  - Portal dealer unit: $407.25 (base_grid)
  - Portal dealer unit: $407.25 (base_grid)
  - Merchandise/customer subtotal: $1,221.75
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $94.69
  - Grand total: $1,316.44
- official_book_dealer_factor [dealer_cost; official_price_book_verified]
  - $961 x .45: $432.45 (base_grid)
  - $961 x .45: $432.45 (base_grid)
  - $961 x .45: $432.45 (base_grid)
  - Merchandise/customer subtotal: $1,297.35
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
- Grand/displayed total: $3,243.39
- Internal product cost: $1,297.35
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $1,297.35
- Block codes: `product_status_not_sendable`
- Block/error: Polar Elite restriction evidence and freight remain incomplete, so the calculated price is not customer-sendable.

805 SOURCE-PRICE RECONCILIATION — AFTER CORRECTION
- Status: priced_but_send_blocked
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- Shade 1 Group 1 baseline: $766.00 (base_grid)
- Shade 1 SunTex 90 Group 4 upgrade: $195.00 (fabric_upgrade)
- Shade 2 Group 1 baseline: $766.00 (base_grid)
- Shade 2 SunTex 90 Group 4 upgrade: $195.00 (fabric_upgrade)
- Shade 3 Group 1 baseline: $766.00 (base_grid)
- Shade 3 SunTex 90 Group 4 upgrade: $195.00 (fabric_upgrade)
- Customer retail subtotal: $2,883.00
- Grand/displayed total: $2,883.00
- Internal product cost: $1,297.35
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $1,297.35
- Block codes: `product_status_not_sendable`, `polar.elite.portal_book_price_conflict`
- Block/error: The pinned Polar book and the exact saved portal quote disagree; the configuration remains quarantined.

BEFORE / AFTER RESULT
- MANUFACTURER SAID: $2,715.00
- 805 SAID BEFORE CORRECTION: $3,243.39
- 805 SAID AFTER CORRECTION: $2,883.00
- BEFORE difference: +$528.39 / 19.46%
- Remaining difference: +$168.00 / 6.19%
- RESULT: FAIL
- Exact discrepancy/root cause: The old engine multiplied the $432.45 book-derived dealer cost by 2.5. The portal itself also conflicts with the pinned book: $839 base + $66 tracks = $905 portal list versus $961 Group 4 book price.
- Correction: Remove the 2.5 conversion and preserve the $961 book cell, while retaining the exact portal ledger separately.
- Remaining limitation: Portal versus book remains +$168.00 across three lines (+6.19%); this exact option is quarantined rather than hard-coded to either source.

### Polar — Polar Motorized Drapery Track

Test: `polar-drapery-pinch-split-white-48`<br>
Product/program: `polar_drapery_track` / `pinch_split_white`<br>
Classification: `official_price_book_verified`<br>
Source: `polar-shades-dealer-book-current-2026-07-18`, page(s) 74

Selections:
- Line 1: 48 x 96; quantity 1; Pinch pleat; split draw; white track; base configuration only

MANUFACTURER SYSTEM / OFFICIAL SOURCE OUTPUT
- official_msrp [customer_retail; official_price_book_verified]
  - 48-inch Pinch Pleat Split White: $472.00 (base_grid)
  - Merchandise/customer subtotal: $472.00
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $472.00
- official_book_dealer_factor [dealer_cost; official_price_book_verified]
  - $472 x .45: $212.40 (base_grid)
  - Merchandise/customer subtotal: $212.40
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $212.40

805 QUOTING SYSTEM OUTPUT — BEFORE CORRECTION
- Status: unpriceable
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- Customer price components: none (fail-closed)
- Customer retail subtotal: $0.00
- Grand/displayed total: $0.00
- Internal product cost: $0.00
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $0.00
- Block codes: `price_components.family_metadata_missing`, `product_status_not_sendable`
- Block/error: A price-group program requires one unambiguous explicit pricing family and baseline program.

805 SOURCE-PRICE RECONCILIATION — AFTER CORRECTION
- Status: priced_but_send_blocked
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- 48-inch Pinch Pleat Split White: $472.00 (base_grid)
- Customer retail subtotal: $472.00
- Grand/displayed total: $472.00
- Internal product cost: $212.40
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $212.40
- Block codes: `product_status_not_sendable`
- Block/error: Pricing is source-backed, but restrictions and freight evidence remain incomplete.

BEFORE / AFTER RESULT
- MANUFACTURER SAID: $472.00
- 805 SAID BEFORE CORRECTION: $0.00
- 805 SAID AFTER CORRECTION: $472.00
- BEFORE difference: -$472.00 / 100.00%
- Remaining difference: $0.00 / 0.00%
- RESULT: PASS
- Exact discrepancy/root cause: A standalone drapery construction was misclassified as a price-group member, so the component engine rejected the base.
- Correction: Declare every named Drapery program as a standalone source grid and preserve the $472 list cell.
- Remaining limitation: Official-price-book verified only; no exact portal result, and customer sending remains blocked for incomplete restrictions/freight.

### Polar — Polar Premium Pro Awning

Test: `polar-premium-pro-awning-120x83`<br>
Product/program: `polar_awning_premium_pro` / `standard`<br>
Classification: `official_price_book_verified`<br>
Source: `polar-shades-dealer-book-current-2026-07-18`, page(s) 165

Selections:
- Line 1: 120 x 83; quantity 1; Premium Pro base grid at the minimum listed 120-inch width and 83-inch projection

MANUFACTURER SYSTEM / OFFICIAL SOURCE OUTPUT
- official_msrp [customer_retail; official_price_book_verified]
  - 120 x 83 Premium Pro: $4,900.00 (base_grid)
  - Merchandise/customer subtotal: $4,900.00
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $4,900.00
- official_book_dealer_factor [dealer_cost; official_price_book_verified]
  - $4,900 x .45: $2,205.00 (base_grid)
  - Merchandise/customer subtotal: $2,205.00
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $2,205.00

805 QUOTING SYSTEM OUTPUT — BEFORE CORRECTION
- Status: unpriceable
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- Customer price components: none (fail-closed)
- Customer retail subtotal: $0.00
- Grand/displayed total: $0.00
- Internal product cost: $0.00
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $0.00
- Block codes: `price_components.family_metadata_missing`, `product_status_not_sendable`
- Block/error: A price-group program requires one unambiguous explicit pricing family and baseline program.

805 SOURCE-PRICE RECONCILIATION — AFTER CORRECTION
- Status: priced_but_send_blocked
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- 120 x 83 Premium Pro: $4,900.00 (base_grid)
- Customer retail subtotal: $4,900.00
- Grand/displayed total: $4,900.00
- Internal product cost: $2,205.00
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $2,205.00
- Block codes: `product_status_not_sendable`
- Block/error: Pricing is source-backed, but restrictions and freight evidence remain incomplete.

BEFORE / AFTER RESULT
- MANUFACTURER SAID: $4,900.00
- 805 SAID BEFORE CORRECTION: $0.00
- 805 SAID AFTER CORRECTION: $4,900.00
- BEFORE difference: -$4,900.00 / 100.00%
- Remaining difference: $0.00 / 0.00%
- RESULT: PASS
- Exact discrepancy/root cause: The standalone awning grid had an inferred price-group identity, so the component engine rejected it before returning a customer price.
- Correction: Mark the awning construction as a standalone source grid and preserve its $4,900 list cell.
- Remaining limitation: Official-price-book verified only; no exact portal result, and customer sending remains blocked for incomplete restrictions/freight.

### Lotus — Lotus Aluminum Mini Blinds

Test: `lotus-mini-aluminum-17x36`<br>
Product/program: `lotus_mini_blinds` / `lotus_amx_1in_aluminum_custom`<br>
Classification: `official_dealer_book_verified_msrp_unverified`<br>
Source: `lotus-west-a26-v1`, page(s) 97

Selections:
- Line 1: 17 x 36; quantity 1; Custom-cut 1-inch aluminum mini blind; base dealer matrix cell

MANUFACTURER SYSTEM / OFFICIAL SOURCE OUTPUT
- official_dealer_net [dealer_cost; official_dealer_book_verified]
  - 17 x 36 dealer matrix: $21.48 (base_grid)
  - Merchandise/customer subtotal: $21.48
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
- Grand/displayed total: $53.70
- Internal product cost: $21.48
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $21.48
- Block codes: `product_status_not_sendable`
- Block/error: Lotus restriction evidence remains incomplete and customer MSRP is not source-defined.

805 SOURCE-PRICE RECONCILIATION — AFTER CORRECTION
- Status: priced_send_blocked
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- AMX 1-inch Aluminum: $64.44 (base_grid)
- Customer retail subtotal: $64.44
- Grand/displayed total: $64.44
- Internal product cost: $21.48
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $21.48
- Block codes: `product_status_not_sendable`
- Block/error: Customer retail is owner-authorized at three times source wholesale; sending remains blocked pending complete restrictions.

BEFORE / AFTER RESULT
- MANUFACTURER SAID: MSRP unverified
- 805 SAID BEFORE CORRECTION: $53.70
- 805 SAID AFTER CORRECTION: $64.44
- BEFORE difference: not comparable / —
- Remaining difference: not comparable / —
- RESULT: UNVERIFIED
- Exact discrepancy/root cause: The prior $53.70 customer amount was $21.48 dealer cost multiplied by 2.5 without a manufacturer MSRP source.
- Correction: Apply the owner-approved three-times-wholesale retail rule on this independent Lotus product grid.
- Remaining limitation: Customer pricing is resolved; complete restriction authority is still required before sending.

### Lotus — Lotus Faux Wood Blinds

Test: `lotus-faux-wood-bright-white-17x36`<br>
Product/program: `lotus_faux_wood_blinds` / `lotus_flx_2in_bright_white_custom`<br>
Classification: `official_dealer_book_verified_msrp_unverified`<br>
Source: `lotus-west-a26-v1`, page(s) 99

Selections:
- Line 1: 17 x 36; quantity 1; Custom-cut 2-inch smooth faux wood; Bright White; base dealer matrix cell

MANUFACTURER SYSTEM / OFFICIAL SOURCE OUTPUT
- official_dealer_net [dealer_cost; official_dealer_book_verified]
  - 17 x 36 dealer matrix: $23.57 (base_grid)
  - Merchandise/customer subtotal: $23.57
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
- Grand/displayed total: $58.93
- Internal product cost: $23.57
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $23.57
- Block codes: `product_status_not_sendable`
- Block/error: Lotus restriction evidence remains incomplete and customer MSRP is not source-defined.

805 SOURCE-PRICE RECONCILIATION — AFTER CORRECTION
- Status: priced_send_blocked
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- FLX 2-inch Faux Wood: $70.71 (base_grid)
- Customer retail subtotal: $70.71
- Grand/displayed total: $70.71
- Internal product cost: $23.57
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $23.57
- Block codes: `product_status_not_sendable`
- Block/error: Customer retail is owner-authorized at three times source wholesale; sending remains blocked pending complete restrictions.

BEFORE / AFTER RESULT
- MANUFACTURER SAID: MSRP unverified
- 805 SAID BEFORE CORRECTION: $58.93
- 805 SAID AFTER CORRECTION: $70.71
- BEFORE difference: not comparable / —
- Remaining difference: not comparable / —
- RESULT: UNVERIFIED
- Exact discrepancy/root cause: The prior $58.93 customer amount was $23.57 dealer cost multiplied by 2.5 without a manufacturer MSRP source.
- Correction: Apply the owner-approved three-times-wholesale retail rule on this independent Lotus product grid.
- Remaining limitation: A different 48 x 72 portal item conflicts with the book and remains quarantined; complete restriction authority is still required before sending.

### Lotus — Lotus Vertical Blinds

Test: `lotus-steel-vertical-35x48`<br>
Product/program: `lotus_vertical_blinds` / `lotus_cv_steel_complete_custom`<br>
Classification: `official_dealer_book_verified_msrp_unverified`<br>
Source: `lotus-west-a26-v1`, page(s) 106

Selections:
- Line 1: 35 x 48; quantity 1; Custom-cut 3.5-inch complete steel vertical; base dealer matrix cell

MANUFACTURER SYSTEM / OFFICIAL SOURCE OUTPUT
- official_dealer_net [dealer_cost; official_dealer_book_verified]
  - 35 x 48 dealer matrix: $31.97 (base_grid)
  - Merchandise/customer subtotal: $31.97
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
- Grand/displayed total: $79.93
- Internal product cost: $31.97
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $31.97
- Block codes: `product_status_not_sendable`
- Block/error: Lotus restriction evidence remains incomplete and customer MSRP is not source-defined.

805 SOURCE-PRICE RECONCILIATION — AFTER CORRECTION
- Status: priced_send_blocked
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- CV Steel Vertical: $95.91 (base_grid)
- Customer retail subtotal: $95.91
- Grand/displayed total: $95.91
- Internal product cost: $31.97
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $31.97
- Block codes: `product_status_not_sendable`
- Block/error: Customer retail is owner-authorized at three times source wholesale; sending remains blocked pending complete restrictions.

BEFORE / AFTER RESULT
- MANUFACTURER SAID: MSRP unverified
- 805 SAID BEFORE CORRECTION: $79.93
- 805 SAID AFTER CORRECTION: $95.91
- BEFORE difference: not comparable / —
- Remaining difference: not comparable / —
- RESULT: UNVERIFIED
- Exact discrepancy/root cause: The prior $79.93 customer amount was $31.97 dealer cost multiplied by 2.5 without a manufacturer MSRP source.
- Correction: Apply the owner-approved three-times-wholesale retail rule on this independent Lotus product grid.
- Remaining limitation: Customer pricing is resolved; complete restriction authority is still required before sending.

### Onyx — Onyx Shutters

Test: `onyx-us-made-vinyl-36x48`<br>
Product/program: `onyx_shutters` / `onyx_us_made_vinyl`<br>
Classification: `dealer_evidence_verified_msrp_unverified`<br>
Source: `onyx-price-screenshot-2026-07-20`

Selections:
- Line 1: 36 x 48; quantity 1; 12 square feet; outside mount; LR two-panel layout; 3.5-inch louvers; standard tilt; white; final frame-to-frame dimensions

MANUFACTURER SYSTEM / OFFICIAL SOURCE OUTPUT
- dealer_cost_evidence [dealer_cost; user_supplied_pricing_evidence]
  - 12 sq ft x $13.60: $163.20 (base_grid)
  - Merchandise/customer subtotal: $163.20
  - Freight: $0.00
  - Processing: $0.00
  - Tax: $0.00
  - Grand total: $163.20

805 QUOTING SYSTEM OUTPUT — BEFORE CORRECTION
- Status: unpriceable
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- Customer price components: none (fail-closed)
- Customer retail subtotal: $0.00
- Grand/displayed total: $0.00
- Internal product cost: $0.00
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $0.00
- Block codes: `onyx.us_made_vinyl.restriction_identity_unverified`, `product_status_not_sendable`
- Block/error: The supplied binder documents only generic Vinyl and does not establish U.S. Made Vinyl restrictions.

805 SOURCE-PRICE RECONCILIATION — AFTER CORRECTION
- Status: unpriceable
- Product/validation status: restriction_source_incomplete / blocked
- Sendable: no
- Customer price components: none (fail-closed)
- Customer retail subtotal: $0.00
- Grand/displayed total: $0.00
- Internal product cost: $0.00
- Internal freight: $0.00
- Internal oversize: $0.00
- Internal processing: $0.00
- Internal landed cost: $0.00
- Block codes: `onyx.us_made_vinyl.restriction_identity_unverified`, `product_status_not_sendable`, `CUSTOMER_RETAIL_UNDEFINED`
- Block/error: The available evidence establishes dealer cost but not customer MSRP or current U.S. Made Vinyl restrictions.

BEFORE / AFTER RESULT
- MANUFACTURER SAID: MSRP unverified
- 805 SAID BEFORE CORRECTION: $0.00
- 805 SAID AFTER CORRECTION: $0.00
- BEFORE difference: not comparable / —
- Remaining difference: not comparable / —
- RESULT: UNVERIFIED
- Exact discrepancy/root cause: The supplied evidence proves $13.60 per square foot dealer cost, but did not prove the prior $34 per square foot customer amount or current product restrictions.
- Correction: Store $13.60 only as dealer cost, remove $34 as source-backed MSRP, and fail closed on customer retail.
- Remaining limitation: Onyx exposes one product family, so three genuinely different Onyx product types cannot be tested; current U.S. Made Vinyl restriction and MSRP evidence are still missing.

## Source-vault verification

Status: BLOCKED; 10 pinned artifacts verified.

- `onyx-price-screenshot-2026-07-20` / `Onyx U.S. Made Vinyl Pricing 2026-07-20.png`: missing.
- `norman-honeycomb-color-coordination-2026-07` / `HC Color Coordination.xlsx`: missing.
- `norman-roller-minmax-appendix-2026-08` / `Roller MinMax Appendix.xls`: hash_mismatch; expected 696832 bytes / `ba286767b6c4d760bf480434312678f6c35b229e9763ddd6fcda9f7cd18b9cc3`, found 706560 bytes / `cbbe9d156414ed7e1fd687bc23931b04e70210a1ad801d848d66cf5d0dd20c56`.

These gaps remain explicit blockers for the affected source paths; they were not treated as successful parity evidence.

## Corrections and unresolved boundaries

- **Manufacturer retail basis:** Suggested-retail/list programs now preserve the source MSRP components. Dealer schedules affect protected cost only; the universal cost-times-2.5 customer calculation was removed.
- **Dealer-only catalogs:** Each independent Lotus product grid now uses the owner-approved retail rule of three times source wholesale; customer pricing can succeed while incomplete restrictions still block sending. Onyx remains fail-closed before customer pricing where current evidence is incomplete; its source-backed dealer cost remains authorization-protected.
- **Price components:** Base grid, fabric delta, accessories, and operating-system charges reconcile independently and sum to the exact customer total.
- **Polar standalone grids:** Drapery and awning programs are explicitly standalone grids instead of being misread as price-group upgrades.
- **Stored-price migration:** The MSRP policy uses new catalog identities; snapshots from the prior markup policy are stale even when their selection fingerprint is unchanged.
- **Dealer-only option ledger:** Onyx H2/H3 and Polar All Seasons option costs are itemized; incomplete or unproven dealer-cost options fail closed.
- **Source integrity:** The Polar generator accepts only the pinned SHA-256 and structural anchors, validates catalog inventory, and writes atomically.
- **Customer data boundary:** Customer failure projections use neutral wording and exclude dealer-net, margin, schedule, freight-cost, and landed-cost diagnostics.

## Evidence inventory

- `norman-current-account-portal-fixture-2026-07-21` — portal_verified_exact_case; Private authenticated configuration capture plus the source-controlled redacted portal ledger; exact Roller case only. Private-artifact SHA-256 `ce2ae5ebc7713113ea7eab24cfb208a8f71ef9a3e61d8dd656ea4e1c527d8b7d`; 140404 bytes; redacted receipt `docs/quote-v2/portal-parity/evidence/norman-roller-portal-capture-2026-07-21.md`; exact case(s): `norman-roller-smartrelease-24x36`.
- `polar-elite-private-capture-2026-07-22` — portal_verified_exact_case; Private user-supplied saved-quote evidence; exact three-line Elite case only. Private-artifact SHA-256 `bca8fe340b1afad3838302ce3f734b04a9128824059152cb043860b0dae6a1a2`; 239424 bytes; redacted receipt `docs/quote-v2/portal-parity/evidence/polar-elite-portal-capture-2026-07-22.md`; exact case(s): `polar-elite-suntex90-manual-three-line`.
- `lotus-three-product-cart-private-capture-2026-07-22` — portal_dealer_observation_not_customer_msrp; Authenticated three-product DO NOT ORDER cart. It exposes dealer amounts, not customer MSRP, and is not reused as MSRP evidence. Private-artifact SHA-256 `74d2088c10e7317b5e3614c74242f4d9648ed4d8ef35f621bbfbde1641d04915`; 133336 bytes; redacted receipt `docs/quote-v2/portal-parity/evidence/lotus-three-product-cart-2026-07-22.md`; no exact-case reuse.

## 805 visible-interface evidence

- `805-norman-roller-after-ui-2026-07-22` — local_ui_verified_exact_case; route `/quote-lab/`; redacted receipt `docs/quote-v2/portal-parity/evidence/805-norman-roller-after-ui-2026-07-22.md`; exact case(s): `norman-roller-smartrelease-24x36`. Actual existing-interface V2 result at $350.00, with the four retail components and red protected wholesale values visibly confirmed.
  - `completed_line_item`: SHA-256 `8ee4a3c50549e9545ebe759640c028ba50ed3ca0c7c91a0eef40b6ff3d2b17b5`; 133810 bytes.
  - `protected_wholesale_ledger`: SHA-256 `c175dfe106da06c35e97eeea11d75fa317b37cd265bb1c0e58b24a7b4afa3d5b`; 111865 bytes.

The private evidence files are not copied into source control. Receipts contain no credentials, session tokens, customer PII, or full authenticated portal URLs. The visible 805 captures contain no customer PII or authenticated manufacturer-portal data.
