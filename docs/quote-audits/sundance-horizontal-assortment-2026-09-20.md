# Sundance horizontal assortment — September 20, 2026

The current hash-verified **J-Sundance-Horizontal-Blinds-12-25.pdf**, effective **December 1, 2025**, contains 136 exact color-and-slat-size identities. All are preserved with source page, hash, existing program ID and dealer reconciliation status in `horizontal-assortment.source.json`.

| Family | Source identities | Dealer-matched selectable identities |
|---|---:|---:|
| Advantage II 2-inch | 11 | 11 |
| Advantage II 2.5-inch | 1 | 1 |
| Premium II 2-inch | 11 | 11 |
| Premium II 2.5-inch | 2 | 2 |
| Aluminum 2-inch | 11 | 11 |
| Aluminum 1-inch, all published gauges/finishes | 41 | 40 |
| BasicVue White | 1 | 0 |
| Chateau 29 finishes × two slat sizes | 58 | 0 |
| **Total** | **136** | **76** |

The dealer's `8-014` formatting maps to printed code `8014`; both exact strings are preserved. Code-bearing legacy `7-...` wood entries are not collapsed into newer material codes. Iceberg and Fog are matched by their exact dealer names because those two menu choices omit the current guide's 904 codes. No other fuzzy color aliases are introduced.

The six captured horizontal dealer menus also contain **72 unmatched choices**, including older colors and code variants absent from the current source tables. They remain named exceptions, not inferred discontinued products. Source-only identities are retained but excluded from new selections pending current dealer availability confirmation. This includes 6-gauge Gray AZ 569, BasicVue's absent dedicated ordering type, and Chateau's absent dedicated ordering type. None is marked discontinued.

Two substantive conflicts remain:

- Aluminum 2-inch **2189** says **Arctic Ice** in the guide and **ARTIC WHITE** in the dealer menu. Exact-code selection is available with an explicit warning to confirm the finish.
- Premium II 2.5-inch has a 92-inch grid row, but the shared specification caps 2.5-inch height at **84 inches**. The visible warning preserves this conflict; source grid evidence alone does not authorize ordering beyond the specification.

The CRM choices retain exact material ID, name, source code, slat size, gauge/finish and all three existing program keys. Color changes clear prior color-dependent valances. Crown-only and available Crown/Flat choices follow each source color's footnotes. The guide's 5% faux-wood color, 20% eight-gauge, 15% Metallix/Jewel and 45% Alumiwood retail additions are retained and displayed for manual-price confirmation; no dealer cost factor or selling-price policy is substituted.

Validation: reproducible PDF-table extraction, unique IDs, all 136 same-family existing grid routes, six independently read first-cell fixtures, exact gauge and surcharge preservation, source-only/cross-family rejection, both saved-editor adapters and conflict presentation. **291 Sundance tests pass; TypeScript passes.** Production save/reopen verification awaits this increment's deployment. Full ordering compatibility, common headrail charges, premium aluminum upgrade, freight and account terms remain unresolved; all Sundance automatic pricing gates remain closed.
