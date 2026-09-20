# Sundance additional valance schedules

Five width-only schedules, 61 numeric retail cells, are now imported with locked source hashes and independent boundary fixtures. These are evidence schedules, not approved customer prices or replacement shade grids.

| Offering | Source | Width columns | First / last retail |
|---|---|---:|---:|
| SheerView flat square valance | H-Sheerview-Pricing_Aug2026.pdf PDF24 table3 | 13 (24–116 inches) | 26 / 152 |
| Portfolio valance only A | 2026 Portfolio guide PDF25 table1 | 12 (24–96 inches) | 275 / 580 |
| Portfolio valance only B | same | 12 | 303 / 618 |
| Portfolio valance only C | same | 12 | 313 / 631 |
| Portfolio valance only D | same | 12 | 346 / 709 |

Portfolio source PDF8/25 explicitly limits standalone valance height to 18 inches and width to 96 inches; includes light-filtering liner and adds 10% for blackout. The evidence lookup rejects absent/nonpositive/over-limit height and width, rounds width upward to the next column, and always returns `customerPriceEligible:false`. SheerView does not accept a Portfolio blackout multiplier. No customer or dealer factor is applied.

Tests independently anchor first and last cells, fractional width boundaries, max-height rejection, and both liner calculations. Remaining internal work: expose correct separate saved valance choices and integrate product-specific compatibility at the visible and server-priced boundaries. External work: current source applicability and account pricing authority remain unverified. This import alone does not close either gate.

## SheerView control/headrail integration

The dedicated SheerView panel now saves documented continuous cord loop, cordless, and rechargeable motor-with-wand control, curved/flat-square/cordless No Drill headrail, CCL cord/metal-chain/plastic-chain/Safe-Wand choices, and Single/Two-on-one assembly. Flat Square stores its exact `sundance_sheerview_valance_p24_t3` surcharge schedule separately from the base program; changing headrail clears it. Changing control clears stale CCL cord choices and incompatible No Drill headrail.

Shared validation is called by both the visible panel and authoritative `validateSelection`: exact code/vane/privacy/program identity; CCL width8–116/height11–144; cordless20–96/11–96; No Drill29–79/11–96; rechargeable motor-with-wand22–116/11–144; flat headrail LF96/RD84 maximum height. Unknown controls/headrails and stale mismatches hard-block. Two-on-one explicitly hard-blocks pending individual component measurements and charges, even when the overall width is within the printed envelope. All Sundance account-pricing holds remain active.

This is a bounded control/size rule increment. Remaining SheerView work includes headrail finish choices, installation depth, complete accessories and charge aggregation, other motor alternatives, two-on-one component model, dealer comparisons and production proof of the new controls. Portfolio standalone-valance saved offering remains separate unfinished implementation work; the imported schedule does not establish it as complete.
