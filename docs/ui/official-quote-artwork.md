# Official quote artwork

Owner requirement, October 22, 2026: every product category in the quoting system uses its dedicated existing official 805 signature pencil sketch. Photographs, stock art, generated replacements, and improvised product diagrams are prohibited.

## Sources and routing

- `OFFICIAL_CATEGORY_SKETCHES` in `src/lib/quote/anatomy-reference-artwork.ts` is the exhaustive mapping of 24 non-custom product families to the existing C, anatomy, and valance pencil collection. Compact and contract layouts share it. Configured controls, valances, and folds continue using the existing approved component assets.
- The dedicated specialty renderer composes the existing `specialty-v1` graphite material, upward-facing louver and sunburst assets into the original 46 specialty outlines and six French-door cutout profiles. See `specialty-shutter-artwork.md` and `specialty-shutter-plan.md` for the established design system and profile identities.
- French-door Types A–F retain their recorded cutout type and handle side. For imported quotes with an unspecified cutout, the existing Type A profile is shown as an explicitly labeled reference. The stored type and side remain unselected. A cutout reference must never be displayed as a plain panel.
- Missing or conflicting configuration can use a labeled official category reference. This does not certify that the pictured controls, geometry, or profile were ordered. Unknown categories visibly say “Official 805 sketch required for this product.” They cannot silently fall back to a document icon or an invented SVG.

## Release gate

`src/lib/quote/contract-product-coverage.test.ts` covers every current catalog product under raw, customer-facing and staff names, at compact and anatomy sizes. It requires an explicit official family mapping, existing local pencil files, approved collection paths, and no generic reference component. The family mapping is exhaustive in TypeScript, so adding a family requires its dedicated sketch entry. Adding a new product that cannot map to official artwork fails catalog coverage.

The October 22 audit covered 87 catalog products plus four additional legacy product-type entries, and inspected all 24 category reference files plus all six French-door cutout profiles. All 52 specialty identities are exercised through the actual contract component by `specialty-shutter-illustrations.test.ts`. `french-door-reference.test.ts` covers the imported incomplete selection and preserves missing choices and prices. Existing specialty exports can be reproduced with `node scripts/export-specialty-sketches.mjs`; this exports the original renderer and creates no new artwork.

Category coverage does not mean every possible configuration has exact artwork. Unsupported details stay in the specifications beside an explicitly labeled official reference; they never authorize a replacement image.
