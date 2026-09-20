# Sundance SheerView assortment reconciliation — 2026-09-20

Status: source-backed identities implemented; production save/reopen proof pending. Automatic customer pricing remains held.

The 2026 SheerView guide, published as `H-Sheerview-Pricing_Aug2026.pdf`, contains 105 unique codes on PDF pages 19–21 (35 each). Its six continuous-cord-loop base grids remain the existing programs `sundance_sheerview_p22_t1` through `sundance_sheerview_p24_t2`. Every code now maps to its printed group, vane size, light control and exact source page. No effective day is printed on the fabric-list pages; the publication month is not represented as an effective date.

59 source codes match the authenticated dealer menu. 46 appear in the current guide only and are selectable for a manual quote with an explicit availability/price confirmation warning. The portal-only entry `NW 2 JAVA RD-S50PN378D` has no verified current source group and is not automatically mapped. Neither absence is treated as discontinuation. The source spells two names `Blh` while the dealer calls those codes `Blush`; the UI retains the exact code and exposes the name conflict.

The UI filters fabric/color choices by vane size and light control. A filter change clears stale color and program identity. Both current and legacy saved editors use the same exact identities. Existing historical quote snapshots and dealer/selling policies remain unchanged.

## Independent checks

At 24 × 36 inches, manually read first retail grid cells are: group 1 New Moon S50PN113-1 = 466; group 2 Carbon S65XN100-4 = 490; group 3 Rhinestone S70PN824 = 513; group 4 Lunar White S50HN100D = 525; group 5 Steel Shadow S65TN822D = 559; group 6 Coastal Plain S70PN503D = 572. Tests compare all six to the existing grids, verify all 105 routes, exact 59/46/1 discrepancies, both saved-editor filters, stale-state clearing and the manual-pricing gate.

## Remaining rules and evidence

This increment does not establish complete orderability or option pricing. Continuous cord loop, cordless, No Drill, motor, two-on-one, flat headrail and oversize constraints need server-enforced compatibility and source-backed option schedules. The flat square valance width schedule on page 24 needs a dedicated option grid. Flat headrails have lower maximum heights (96 inches light filtering, 84 inches room darkening) than the base tables. Two-on-one requires assembly modeling. The guide mixes retail option charges with explicitly net motor/accessory charges; those must remain separate. Account-specific dealer terms and representative portal comparisons are unresolved.

Generated provenance: `src/lib/quote/sundance/sheerview-assortment.source.json`; reproduction: `scripts/sundance/import_sheerview.py --source-dir <locked PDFs> --portal-dir <captured menus>`. PDF SHA-256 is checked against `scripts/sundance/sources.lock.json` before generation.
