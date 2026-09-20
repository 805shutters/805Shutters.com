# Sundance cellular catalog reconciliation — September 20, 2026

Status: source-backed routing implemented; automatic customer pricing remains blocked. This is a completed cellular identity/routing repair, not certification of the full Sundance assortment or account pricing.

## Evidence

The pinned `I-Cellular-Shades_2026-web.pdf` color index (PDF pages 3–6, printed effective May 1, 2025) contains 148 distinct color/cell codes. All 148 match the authenticated Sundance Blindata cellular menu observed September 20. The menu has 157 labels; nine additional legacy/ambiguous labels remain unresolved. Portal display labels sometimes split codes or mislabel cell sizes, so the CRM retains the exact printed code and cell size.

The index and grid headings disagree on several fabric groups. Five 36 × 60, inside-mount, cordless comparisons in the dealer portal confirmed the index routes:

| Exact source code | Collection | Group/program | Source retail | Cordless retail | Observed dealer net |
| --- | --- | --- | ---: | ---: | ---: |
| PS41RA-023 | Bamboo light filtering, Royal Gray | 3 / sundance_cellular_p9_t1 | 626 | 194 | 131.20 |
| PS42RA-023 | Bamboo blackout, Royal Gray | 5 / sundance_cellular_p11_t1 | 785 | 194 | 156.64 |
| PS47K0-001 | Whisper Woven, Cotton | 3 / sundance_cellular_p9_t1 | 626 | 194 | 131.20 |
| PS410-001FR | Fire-retardant light filtering, Cotton | 5 / sundance_cellular_p11_t1 | 785 | 194 | 156.64 |
| PU422SS-766 | Cell-in-a-cell blackout, Classic Gray | 4 / sundance_cellular_p10_t1 | 690 | 194 | 141.44 |

These five comparisons were saved and visibly reopened together in unsubmitted dealer draft `805 CATALOG AUDIT 0920 DO NOT ORDER`, order `a2cb0fbf-e522-4509-b094-8129dea40dda`. Nothing was submitted or ordered. Observed net amounts are comparison evidence only; no account factor, freight, tax, or selling policy was changed.

## Implemented

- Reproducible, hash-checked extraction of all 148 exact source identities, page provenance, printed groups, cell sizes and light-control categories.
- Shared color registry, UI catalog, and explicit existing-program routing for all 148 identities.
- Both saved CRM editor adapters honor the explicit Sundance product and preserve its program, avoiding Norman color/grid substitution.
- Cell-size and blackout/light-filtering filters use source values. Existing product IDs, grid IDs, imported numeric cells and historical snapshots are retained.
- All Sundance products remain manual-price-required until their complete configuration rules and account terms are certified.

## Exact remaining exceptions

The additional dealer labels are `3C-002 SNOW WHITE`, `3C-005 SMOOTH CREAM`, `3C-070 SMOOTH WINTER WHITE`, `4C-005 SMOOTH CREAM`, `37S-001- COTTON-9/16 SLUB WOVEN`, `37S-004- ALABASTER-9/16 SLUB WOVEN`, `37S-021- GRAY SHEEN-9/16 SLUB WOVEN`, `CR-070- WINTER WHITE-9/16 CRUSH`, and `LUX LINEN B0-992`. They need authoritative current identity/group/availability evidence; none was silently discarded or marked discontinued.

Cellular still needs exhaustive control, dimensional, specialty, Verticell, mounting, motor/accessory and charge rules; account-factor/retail-versus-net exceptions, freight and fees; and actual production CRM save/reopen/customer-output proof. The five dealer fixtures do not certify every color or configuration.

Across Sundance, 28 pre-existing families and 98 source programs remain manual priced. Six families have no extracted grids. Current dealer menus also expose `Drapery Tracks → DRAPERY MOTOR AND TRACK → GLYDEA TRACK`, absent from those 28 destinations. A 29th, explicitly manual-required CRM destination `sundance_drapery_track` now accounts for it, with all seven observed option menus. Its complete rates/rules still require reconciliation before automatic pricing. The legacy Flat Roman family was not in the dealer Roman menu observed; absence alone is not discontinuation evidence.

## Validation and release proof

Focused tests cover all 148 unique identities, five independent dealer comparison base prices, all 98 source-grid boundary sweeps, both editor adapters, shared UI catalog exposure, serialized stable identity recovery and the retained account-pricing gate. TypeScript checking must pass before release.

Production verification scenario: choose Sundance cellular (`sundance_cellular`), 3/4-inch cell, Blackout, `PU422SS-766` Classic Gray. It must retain `sundance_cellular_p10_t1`, show only valid cell/opacity color choices, remain manual-priced, save and reopen with those exact identifiers, and preserve an explicitly entered manual customer price. Repeat Bamboo LF (`PS41RA-023`, group 3), Bamboo BO (`PS42RA-023`, group 5), and switch cell sizes to verify hidden invalid colors cannot silently retain a mismatched selection.

Detailed local evidence: `outputs/sundance-audit-20260920/{portal-fabric-inventory.json,cellular-mapping-ledger.json,dealer-cellular-comparisons.json,unresolved-cellular-portal-labels.json,family-ledger.csv,program-ledger.csv}`. Source hashes are pinned in `scripts/sundance/sources.lock.json`.

## Dedicated CRM configuration panel

The manual-price route previously hid the entire configuration panel, so a registry-only change was insufficient. Both CRM versions now render a dedicated Sundance panel beneath the retained manual-price notice. Cellular colors save all three program keys and exact code/identity; changing cell size or light control clears the previous color and grid. Glydea stores its seven choices under vendor-specific keys and cannot inherit Polar motors or prices. These panels expose source-backed identities; they do not claim complete control/dimension compatibility certification.

The authenticated portal roster capture covers all eight top-level categories and 17 ordering types: Portfolio Roman 113 labels; Wovenwood 110; Euro Panel 518; Cellular 157; Clutch Roller 518; Motorized Roller 518; Caress-Zebra 77; SheerView 60; Exterior Zipper 57; 1-inch Aluminum 67; 2-inch Aluminum 25; Vertical Essence 131; 2-inch Advantage 24; 2.5-inch Advantage 4; 2-inch Wood 23; 2.5-inch Wood 5; Glydea Track 1. Total 2,408 menu rows, including shared lists and duplicates, not 2,408 certified unique offerings. Every row is retained in the local assortment ledger with a mapped destination or exact unresolved exception. Shutters, cable exterior, Flat Roman and some source-book subfamilies are absent as standalone portal types; this is an orderability question, not discontinuation evidence.

Validation for this increment: 312 tests across eight relevant suites and TypeScript pass. Production save/reopen proof remains separate.

## September 20 follow-up status

Subsequent repairs now account for 29 destinations, 100 base grids and seven separately modeled supplemental grids. All 107 source tables pass independent text-row/width-axis comparison (1,288 rows). See `sundance-grid-repair-2026-09-20.md` and `sundance-supplemental-grids-2026-09-20.md` for current counts and exact remaining exceptions; earlier counts above describe their original increments.

Production internal unsent draft 805-0335 was saved, closed and reopened. It preserved PU422SS-766 at 36×60 and all seven Glydea choices at 96×84, plus explicitly labeled manual persistence fixtures 123.45/234.56. The incompatible cell-size change cleared the selected fabric. This proves those paths and persistence, not every offering or any account price.
