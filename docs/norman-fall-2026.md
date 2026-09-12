# Norman Fall 2026 catalog additions

The catalog now includes all 90 Fall colors across 19 collections, for a total of 440 colors and 92 collections. The publication baseline (`0d659d11824891b0359a8b7aa3e0668a2a3f8f32`) already contained 14 PG4 colors. This change preserves those records, their routes and their September grid, and adds the remaining 76 colors without duplicating anything. All original 350 colors also remain unchanged.

The versioned Fall programs share four verified September retail grids. The existing PG4 selection route stays in place; existing program IDs, grids, dealer-cost rules, adjustments, discounts, freight, tax, manual overrides and stored snapshots are preserved. Both current and legacy quote interfaces receive the new catalog and routing. No database migration or saved-record rewrite is involved.

The current protected quote engine also receives exactly 76 new offerings, 192 application rows and 2,304 complete profile assignments from the September manufacturer appendix. These cover all twelve application sheets. Existing August and September PG4 profiles stay untouched. Missing/unsupported configurations remain blocked. The source generator asserts the manufacturer workbook hash and exact color identities.

Source inputs:

- User-provided Soluna Fall 2026 update kit: additions scope only; sample-bag removal instructions excluded.
- Roller Shade Guide, PDF pages 9, 10 and 13: canonical codes, names, categories and fabric widths. SHA-256 `e9cc15ce95e5d0c2305b639df612af39e7f17fb316d001631e3c3cbff36e0b2e`.
- September 2026 retail guide, PDF pages 18–19: all 600 PG1–4 grid cells. SHA-256 `3767de1e04ee7c8dc6bab14a6224868e4ca366f2ec4be2d8d3d13ec5cf45aafd`.
- September Roller MinMax Appendix: SHA-256 `754e924e4b3c4429b5452e3de0d0ed330d7b2a376613783c9659766f61a04629`.
- Public Soluna page: exact-SKU visible alternate names are searchable aliases; filenames are not treated as color names.

Verification:

- Full repository tests: 3,552 passed; 33 skipped. Includes preserved legacy fingerprints, all 600 price cells, all 90 identities through the protected quote engine, invalid dimensions, September activation dates, option pricing and serialization.
- Typecheck and production build passed.
- Local Chromium desktop and iPad-size touch scenarios passed against the current real DesignCard. Covers all 440 search results, category filtering, new selection, synthetic save/reopen and copying, contract descriptions, independent price lock, and a retained $777.77 manual price. Screenshots were visually inspected.
- Browser checks use local fixtures, not production customer records or physical iPad Safari. Deployment and live verification remain separate.

Repeat the catalog import using `scripts/generate-norman-roller-fall-2026.py` with `--guide`, `--retail`, and `--public-html` snapshots. Generate the protected compatibility data using `scripts/generate-norman-roller-fall-2026-matrix.py` with the pinned workbook path. Generated data retains source hashes, pages, sheet rows and cell references.

Run browser fixtures with `node node_modules/vite/bin/vite.js --config e2e/norman-fall.vite.mjs`, then `E2E_BASE_URL=http://127.0.0.1:4193 npx playwright test e2e/norman-fall.local.spec.ts`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if using an existing compatible Chromium installation.
