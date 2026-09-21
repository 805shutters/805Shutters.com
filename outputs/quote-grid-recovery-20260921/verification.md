# Grid and priced-option quoting — verification

## Work plan

- Complete: trace Jon Loring draft 805-0367 and preserve its selected designs.
- Complete: isolate quote-time grid/option inputs from installation and order-readiness validation.
- Complete: retain $25 installation + existing $14 shipping for each physical blind/shade, multiplied by line quantity.
- Complete: integrate retail component ledger independent of incomplete dealer costs, automatic recovery of blocked drafts, and focused regression checks.
- Complete: apply all seven reviewed production migrations in the documented dependency order; verify guarded nullable cost fields, constraints and service-only RPC permissions.
- In progress: full release checks; first gate found six regressions before push, including one real Lotus price-conflict snapshot safeguard being retained.
- Remaining: deployment, save/reopen Jon's quote, verify staff and customer output.

## Independent expected amounts

| Line | Ordered size | Price basis | Quantity | Expected line amount |
|---|---|---|---:|---:|
| Bedroom 1 Roman | 91 × 48 | Lakeside F0183, PG2, 96 × 48 grid = $2,008; $25 installation + $14 shipping | 1 | $2,047 |
| Dining Room Onyx Poly Composite | 92 × 71 | VZ Small four-sided window-size footprint 96 × 75; 50 sq ft × $31 + four H3 panels × $10 | 1 | $1,590 |
| Office Onyx Poly Composite | 69 × 71 | Footprint 73 × 75; 39 sq ft × $31 + two H3 panels × $10 | 2 | $2,458 |
| Bedroom 2 Onyx Poly Composite | 69 × 71 | Same price basis as Office | 2 | $2,458 |

Expected merchandise/service total before existing quote-level adjustments: **$8,553**. Four quote lines represent six window units. No new blind/shade installation charge applies to the shutter lines. Onyx H3 supplier cost is unverified and must not be represented as zero or a completed margin.

Production evidence is pending; local expected values are not live verification.
