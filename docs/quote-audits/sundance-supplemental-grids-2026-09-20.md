# Sundance remaining grid reconciliation — September 20, 2026

The page-by-page scan identified eight nonduplicate rectangular price tables that were absent after the first grid repair. They are now imported, preserving every existing product and program ID.

| Offering | Source and destination | Independent first / last cell |
|---|---|---|
| Stock vertical blinds | K-Vertical-Essence-V2.pdf, PDF/printed K-12; `sundance_vertical_essence_p12_t1` | 32×44 = 125; 126×96 = 619 |
| Premier light-filtering liner | Walden Premier, PDF20 table1; `sundance_walden_premier_option_p20_t1` | 24×36 = 34; 96×108 = 377 |
| Premier blackout liner | Walden Premier, PDF20 table2; `sundance_walden_premier_option_p20_t2` | 24×36 = 37; 96×108 = 396 |
| Premier narrow twill/ramie edge | Walden Premier, PDF21 table1; `sundance_walden_premier_option_p21_t1` | 24×36 = 38; 96×108 = 113 |
| Premier wide twill edge | Walden Premier, PDF21 table2; `sundance_walden_premier_option_p21_t2` | 24×36 = 49; 96×108 = 147 |
| Select light-filtering liner | Walden Select, PDF19 table1; `sundance_walden_select_option_p19_t1` | 24×36 = 34; 96×108 = 377 |
| Select blackout liner | Walden Select, PDF19 table2; `sundance_walden_select_option_p19_t2` | 24×36 = 37; 96×108 = 396 |
| Select edge binding | Walden Select, PDF19 table3; `sundance_walden_select_option_p19_t3` | 24×36 = 38; 96×108 = 113 |

The source manifest pins the exact files and hashes. The vertical page explicitly says effective August 1, 2024. The current linked Walden books are the 2026A files updated October 1 and October 21, 2025; this audit does not invent a uniform effective date for all offerings. Fresh September 20 downloads matched the pinned source hashes.

The catalog now holds **100 base grids / 19,208 numeric base cells**, plus **7 separate supplemental grids / 630 numeric option cells**. Supplemental grids have source retail evidence but `customerPriceEligible: false`; they are not standalone shade programs. `option-grids.ts` provides a product-scoped source lookup without calculating dealer cost or customer selling price.

The independent text-layer audit checks **107 tables, 1,288 price rows and every width axis**, with zero differences or bad axes. All eight first/last fixtures above were checked visually against rendered source pages. The stock square-valance row is expressly excluded from the base grid rather than misread as a ninth height row.

## Exact unresolved configuration work

- Stock vertical: selectable stock-vs-custom path, White/Off-White, wand and one-way draw only, soft-white extruded reversible aluminum headrail, square-valance width charges, $5 net width cut-down and $5 net height cut-down, FOB Arcadia only/no delivery. The base grid is source evidence, not proof that these order rules are implemented.
- Walden: liner/edge selections and colors, compatibility and required-edge exceptions, movable Premier liner surcharge ($309 added to shade with liner), Select valance-only liner ($38) and edge ($23, except fabrics requiring edge), plus remaining accessory and account terms. These separate grids preserve the evidence needed for that work; they do not yet create selectable UI options.
- No account factor, automatic-pricing activation, freight policy or selling-price policy changes are included.

## Production persistence proof already completed

Unsent internal draft **805-0335**, customer **Sundance Catalog Verification 2026-09-20**, was saved, closed and reopened through production CRM.

- Living Room: 36×60, exact `PU422SS-766`, Cell-In-A-Cell 3/4-inch Classic Gray Blackout. Cell-size change to 9/16 cleared the incompatible fabric; restoring 3/4 and reselecting persisted.
- Office: 96×84 Glydea track; all seven captured selections persisted: IRISMO45 rechargeable 0.8Nm, Bronze, Motor Right, noncurved, Split, Ripple Fold, Situo5.
- Manual amounts **123.45 and 234.56 are explicitly labeled persistence fixtures**, not verified prices. Total 358.01 persisted. No send, sale, signature, payment or order occurred.
- The customer contract showed cellular identity and retained the track selections; follow-up presentation repair replaces incomplete brand-stripped track text with complete neutral descriptions. Live verification of that repair and the bounded product picker follows deployment.

This is a verified import and persistence increment, not completion of Sundance's complete assortment or automatic pricing.

## Source-backed selection increment

Stock vertical now has its own saved stock/custom switch and exact existing-family program route. Selecting Stock exposes White/Off-White, square-corner valance and separate width/height cut-down choices. The source's wand/one-way/headrail requirements and pickup-only restriction are visible and saved. Returning to Custom clears the stock route and choices; it does not claim a verified custom-fabric route.

Walden Premier/Select now expose their own liner and edge-binding selections, retaining the exact supplemental grid ID separately from the base program. Liner colors follow each book and opacity; changing liners clears stale colors and movable-liner selections. Only Premier offers the source-backed movable liner here. These choices remain manual priced. Fabric/control compatibility, binding colors, required-binding exceptions and exact accessory charges still require completion.

Tests reject cross-family and wrong-option-kind IDs, verify stale dependent values clear, confirm source-specific rendered choices, and retain the automatic-pricing gate. Production save/reopen of these new controls remains pending deployment.
