# Sundance Walden assortment — September 20, 2026

The current pinned Premier and Select books contain **104 exact material codes**: 47 Premier and 57 Select, on PDF pages 3–4. Each has its printed price group, existing base-grid destination, source file/hash/page and reference constraints. `scripts/sundance/import_walden.py` extracts these records reproducibly and independently locates each of the 12 group headings above its published table.

**102 identities match current dealer names**, using only case, accents and parenthetical ordering cautions as normalization. These are now selectable with their exact code/name in the correct Walden family. The two source-only identities remain represented but unavailable for a new selection pending dealer reconciliation; they are not marked discontinued. Existing IDs and quote snapshots are preserved.

| Exact exception | Evidence / treatment |
|---|---|
| E-233B Castelo Black | Source index; dealer says CASTELO BLANC. Not treated as the same color. |
| WS-0219 Umbria Sepia | Source index; dealer says UMBRIA SEIPA. No silent spelling alias. |
| ANDIE BEIGE | Dealer label has no exact source identity. |
| CASTELO BLANC | Dealer label unresolved against source Castelo Black. |
| PUDON WHITE (WS-06021-SP FD) | Dealer code variant unresolved; distinct from mapped WS-0602 Pudong White. |
| UMBRIA SEIPA | Dealer spelling variant unresolved against source Umbria Sepia. |
| UNBRIA INK | Dealer spelling variant unresolved; exact UMBRIA INK maps independently to WS-0288. |
| Peri Mist, Tortola Natural, Umbria Mist | Each appears twice in the dealer list. Source identity retained, with visible warning to confirm exact material code. |

Fourteen matched Select materials have another explicit conflict: the dealer label says edge binding is mandatory at no charge, while the current printed index marks them for edge seal if ordered without binding. The affected codes are retained in `walden-assortment.source.json` with `edgeBindingSourceConflict: true` and a visible configuration warning. No price or required-binding rule was inferred from this conflict.

The source's Premier motorized square-foot limits, coordinated edge color, required-binding and cordless TDBU flags are retained in the source records. These do not imply complete control/dimensional rules are enforced yet. Select required/recommended/edge-seal footnotes remain distinct.

Selection writes exact material/code/product and all three existing program keys. Changing fabric clears prior liner/binding choices and their grid IDs so stale accessories are not silently retained. Liner options and colors continue to use their book-specific choices. Both saved CRM editor adapters and the shared color catalog use the same identities and preserve the separate Sundance manufacturer route.

All prices remain manual-required. This increment adds fabric identity/routing and source constraints, not certification of account costs, accessory totals, complete availability, or automatic customer pricing.

Validation: every source row has a unique ID and a same-family existing grid; independent first-cell group fixtures; both editor families produce 46 selectable Premier and 56 selectable Select identities; cross-family/source-only selection rejected; stale accessory clearing and conflict UI verified. TypeScript passes. Production save/reopen proof of these newly added material choices remains pending deployment.

## Authenticated dealer price evidence

The existing unsubmitted dealer audit order now preserves line6 Aires White (`E-M01`), 36×60 Inside, Flat, Cordless, no liner and no multi-blind charge. Dealer group F1 has base retail **708**, matching Premier group F; observed net **318.60**, tax **23.10**, total **341.70**. This one observed 0.45 relationship is not an account-policy substitution.

Separate line7 adds Blackout. The portal shows option retail **87**, net **357.75**, tax **25.94**, total **383.69**. The hash-verified current Premier PDF20 blackout grid at 36×60 is **86**. This **1-dollar retail discrepancy remains unresolved**, and the option grid stays ineligible for automatic pricing. The light-filtering menu showed net36.90, consistent with the published82 cell at the observed fixture factor; it was not saved as a separate priced comparison. Neither draft line was submitted or ordered.
