# Sundance roller, flat Roman and Europanel fabric reconciliation

The pinned current six family indexes contain **287 collection rows**, each independently associated with its own guide's price-group heading and existing program. The November 1, 2025 roller books and August 1, 2024 flat Roman/Europanel books retain their separate effective dates and hashes. A shared dealer fabric roster does not make their price groups interchangeable.

| CRM family | Source collection rows | Reconciled exact dealer-label routes | Named matching exceptions |
|---|---:|---:|---:|
| Sundance roller | 43 | 178 | 30 |
| Sundance flat Roman | 45 | 0 | Current dealer ordering type absent |
| Sundance Europanel | 45 | 189 | 31 |
| Louvolite roller | 52 | 155 | 39 |
| Louvolite flat Roman | 51 | 0 | Current dealer ordering type absent |
| Louvolite Europanel | 51 | 31 | 20 |
| **Total** | **287** | **553** | **120 label exceptions plus orderability gaps** |

These are family-specific routes, not 553 globally unique colors. The exact visible dealer labels are stored as identities; the books do not publish individual color codes, so none are invented. Matching requires a unique source collection with consistent explicit privacy/openness and terminal fabric width where supplied. Unmarked labels are only routed when the collection has one unambiguous source entry. Abbreviated names, multiple possible privacy/FR variants and conflicting widths remain exceptions. One-letter M/S screen names cannot capture unrelated fabrics.

Examples of preserved conflicts:

- **ARUBA-WHITE B/O-118** contradicts the roller guide's Aruba **Sheer**.
- Daybreak dealer labels say **82-inch** fabric; current roller guide says **118-inch**.
- Shot Silk dealer labels say **118-inch**; its source says **80-inch**.
- Morelle labels without an FR distinction remain unresolved between FR and standard variants. The explicit **MORELLE 6515 B/O RETARDANT** label maps to FR Morelle Blackout group 6.
- Cheviot, Haven, Nordic and other unmarked privacy variants are not silently assumed light filtering.
- Argent Champagne uses **group D** for Louvolite roller and **group E** for Louvolite Europanel. The same displayed color name retains two different existing program destinations.

All source collections now have a CRM selection and pricing destination. Only reconciled exact dealer colors appear in the new-color selector. A collection without reconciled current colors visibly requires availability/material confirmation; flat Roman additionally warns that its dedicated current ordering type was not found. Selecting a new collection clears the old exact color. Source privacy, fabric width and railroading are retained as reference constraints, with a warning that final control/top-treatment limits remain to be reconciled.

This increment does **not** certify complete fabric-width/control compatibility, charge totals, account factors, freight, or automatic selling prices. Existing source grids, historical snapshots and account pricing gates remain unchanged.

Validation includes all collection and dealer-label routes resolving to same-family existing programs; independently read retail first cells (Allure roller293 vs Europanel201, Argent roller565 vs Europanel472); cross-family rejection, stale-color clearing, exact exception withholding, both saved-editor filters and source-only UI warnings. **302 Sundance tests pass; TypeScript passes.** Production save/reopen proof awaits deployment.

## Price grids with no collection in the current printed index

Eight imported grids have no collection assignment in their own current family index. This is a source-assortment gap, not evidence of discontinuation. They remain retained with historical IDs; no fabricated fabric routes or account prices were added.

| Family | Guide price groups | Existing program IDs |
|---|---|---|
| Sundance roller | 1, 8, 9, 10 | `sundance_roller_p6_t1`, `sundance_roller_p20_t1`, `sundance_roller_p22_t1`, `sundance_roller_p24_t1` |
| Sundance flat Roman | 1, 10 | `sundance_flat_roman_p41_t1`, `sundance_flat_roman_p50_t1` |
| Sundance Europanels | 1, 10 | `sundance_europanels_p5_t1`, `sundance_europanels_p14_t1` |

All three Louvolite family grid groups have at least one printed collection assignment. The unmatched Sundance groups require an authoritative current fabric-to-group roster or confirmation that the groups are retained solely for older materials.
