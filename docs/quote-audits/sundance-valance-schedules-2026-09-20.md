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

## Portfolio standalone offering and documented control limits

All 102 source fabrics now also have a distinct `Valance Only` identity (102 additive identities, 487 valid fabric/style routes total). Existing 385 shade identities remain unchanged. Standalone selections retain no shade program and store their own group A/B/C/D schedule. UI and both saved adapters expose these identities. Changing styles clears old shade/control/assembly/valance state; selecting standalone material cannot carry a shade control.

Standalone UI captures source liner LF03 Ivory/LF02 Snow White/BO01 White, inside/outside mount, 1½/2½-inch headrail depth, Standard returns and outside-only Extended returns. Shared visible/server validation enforces exact group schedule and 96×18 maximum. BO01's 10% is retail source evidence, not an account or selling factor.

Shade UI captures controls Cordless, Cordless TDBU, Clutch and Loop, Somfy Sonesse Ultra 30, Standard LI Motor and Power Lift; Standard/Waterfall drop; liner; and Single/Two-on-one assembly. Page 18 dimensions are enforced: cordless 16–96×25–96; TDBU 24–48×24–72; clutch 16–96×18–96; Somfy 29½–96×18–96; Standard LI 23⅜–96×18–86; Power Lift 30–96×18–96. Hobbled is waterfall-only, height ≤72. TDBU additionally requires Knife Pleat, Standard drop and a source-eligible material; Caravello is excluded. Two-on-one remains hard-blocked pending component measurements/charges, with 112-inch overall headrail limit noted but not substituted for individual restrictions.

Remaining internal implementation: shade mount/depth/return fields, front/back/interior valance options, exact accessory/motor charge aggregation and shared order accessories, two-on-one model and source-derived order deductions. External source conflict: Portfolio page 18 gives ¼-inch inside deduction; page 20 states ⅜-inch overall shade deduction. Do not silently choose one for ordering. Current manufacturer clarification is needed to establish which applies to each dimension.
