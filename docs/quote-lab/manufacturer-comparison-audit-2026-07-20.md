# Manufacturer Comparison Pricing Audit - 2026-07-20

## Scope

This audit validates the protected Quote Lab manufacturer comparison against the server-authoritative catalog and pricing engine. It covers every manufacturer sharing Shutters, Roller Shades, Mini Blinds, Faux Wood Blinds, and Vertical Blinds.

## Source Integrity

- Norman: exact PDF SHA-256 verified; 40 pages, 321 grid rows, 147 surcharges, and 32 motor options matched the July 2026 source.
- Polar: the current 246-page Dropbox PDF was downloaded again. A temporary full regeneration produced an exact byte-for-byte match to the committed 13-product, 79-program catalog.
- Lotus: exact PDF SHA-256 verified; all 113 pages, 3,206 stock records, 1,496 matrix cells, 1,414 priced cells, and 82 blocked cells reproduced without catalog changes.

## Exhaustive Engine Coverage

- 16 shared-category catalog products
- 87 price programs, including 13 square-foot shutter programs
- 13,237 priced source grid cells checked at exact dimensions
- 73 null or unavailable cells verified as blocked
- 7 source-priced cells verified as blocked by stricter published minimum, maximum, or area rules
- 11,433 applicable between-grid cases verified to round upward
- Quantity math checked on every retail grid cell at quantity 3 and every square-foot program at quantity 40
- Retail and dealer-cost calculations checked independently
- Every shared program projected through the comparison endpoint and matched against direct authoritative pricing
- Every published program minimum, maximum, area limit, and grid oversize boundary exercised

## Defect Found And Fixed

The provisional shutter catalog omitted manufacturer identity for `norman_shutters` and `onyx_shutters`. Both products therefore appeared to belong to Norman, suppressing the cross-manufacturer Shutters comparison. The catalog now identifies Norman and Onyx separately, the comparison appears, and both products are labeled `Provisional pricing source`.

## Verification Results

- Unit/integration: 900 passed, 4 skipped
- TypeScript: passed
- Production build: passed, 215 pages
- Playwright: 4 passed on the exact Quote Lab interface
- Desktop/mobile manufacturer comparison: no horizontal overflow; explicit switching verified

## Remaining Source Boundaries

- Norman and Onyx shutter prices remain provisional because the available shutter source is the pre-2026 MTS catalog, not a current manufacturer price guide.
- Lotus customer retail remains undefined; only dealer-net cost can be shown.
- Polar Exterior Clutch remains unavailable because its source section has no usable pricing.
- Source-defined manual pricing, freight gaps, null cells, and unsupported sizes remain blocked or explicitly labeled. They are not estimated.
