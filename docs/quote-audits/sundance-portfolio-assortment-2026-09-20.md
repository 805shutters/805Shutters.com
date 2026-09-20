# Sundance Portfolio Roman reconciliation — 2026-09-20

Status: exact source identities and style routing implemented; production save/reopen pending. Complete configuration and account pricing remain held for a manual quote.

The 2026 Portfolio Product Guide has **102** material codes on PDF pages 3–5. **84** match exact current dealer pattern/color names, **18** appear in the guide only, and **29** captured dealer labels have no exact current source match. Exact discrepancies and source hashes are preserved in `portfolio-assortment.source.json`. Apparent dealer misspellings such as CHAISSON/Chiasson, THESIS/Theis, MERDIA/Merida and CONTRETE/Concrete are deliberately not silently equated. No absence establishes discontinuation. The guide-only entries are selectable with a visible availability and price confirmation warning. No exact effective day is printed on these reference pages; edition 2026 is recorded without inventing a date.

All 102 codes map through their valid styles to the existing eight grids. There are **385 distinct valid code/style routes**: 82 Flat, 102 Knife Pleat, 99 Hobbled and 102 Front Slat. Twenty materials carry footnote [1] excluding Flat; three Oriana materials carry footnote [2] excluding Hobbled. Flat/Knife Pleat use pages 21–22; Hobbled/Front Slat use pages 23–24. A style change clears the prior color and program. Both saved editors filter by exact style. Caravello's TDBU-unavailable metadata and the guide's cord-loop color are retained.

Independent 24 × 24-inch first-cell retail anchors: Flat/Knife groups A–D = **496, 538, 553, 623**; Hobbled/Front groups A–D = **518, 553, 576, 674**. Tests cover every route, these eight source anchors, forbidden combinations, changed-style clearing, current/legacy editor filters, availability warnings and the manual-price gate.

## Remaining configuration work

Hobbled is waterfall only with a 72-inch maximum height; the UI warns explicitly. Source dimensions differ by control: ordinary cordless minimum 16 × 25 inches, clutch 16 × 18, Cordless TDBU 24–48 × 24–72, Somfy Ultra minimum width 29½, standard Li motor minimum 23⅜ and maximum height 86, Power Lift minimum width 30. Standard TDBU requires Standard shade construction and Knife Pleat panel style. All style/control dimensions still require server-enforced rules. Assemblies can have a 112-inch headrail but individual panels retain their own bounds. Do not widen a single shade's grid to 112.

Liner choices LF03 Ivory, LF02 Snow White and BO01 White, waterfall/standard valances, mounting, alignment, motor/remote/power choices, multiple-shade assembly charges and valance-only/cut-fabric offerings still require complete UI/model/source pricing support. Base grids include light-filtering liner and cordless or clutch; blackout adds 10% to source retail. This increment does not set dealer factors or customer selling policy and does not authorize automatic pricing.

Reproduce with `scripts/sundance/import_portfolio.py --source-dir <locked PDFs> --portal-dir <captured menus>`. The PDF hash must match the source lock.
