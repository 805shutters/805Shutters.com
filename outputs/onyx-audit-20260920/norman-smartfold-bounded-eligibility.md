# SmartFold outside-mount pricing branch — 2026-09-20

## Finding and scope

The SmartFold family-wide `restriction_source_incomplete` status prevented even fully documented configurations from producing a customer-eligible price. New catalog revision r8 uses `documented_limited` only for September 20–30, current ordering fabric, individual standard outside-mount shade, No Valance, Motorized / Norman Smart Rechargeable Battery (AC Charger). Every existing dimension, fabric/lift, fold, installation, shim and accessory validation still applies. Optional premium hem, Light Guard, hold-down, pole, side-by-side, common valance, custom valance and door/specialty applications are excluded from this branch. Other configurations retain their pricing hold and an exact branch explanation.

## Source evidence

Source: `current-sources/SmartFold Guide.pdf`, downloaded dealer guide, SHA256 `15ce45a1f490c4b88a737b06c6f903fdd416152df41ad808d8c6caed7f3714dd`.

| Source page | Evidence and implementation |
|---|---|
| 2 | July 1 removal of door applications; September assortment/size updates; October 1 motor upgrade. Door applications excluded; October remains held pending its separately effective motor verification. |
| 5; September 10 min/max appendix | Current 15 ordering colors resolve through existing exact fabric/program mappings. All 15 are exercised through actual CRM repricing at 36 × 60. Existing collection-specific motor size tables still validate each configuration. |
| 15, 23–24 | Louise above 72 requires a fabric valance; existing restriction retained. Outside order width has no inside deduction. Existing lift/size rules retained. |
| 34 (visually inspected PDF) | Screw mounting area and shade mounting space are separate measurements. 3½/4½-inch bracket: minimum 0.75-inch screw area and 1.5-inch shade space. Six-inch bracket: 1.15-inch screw area and explicit text minimum 2-inch shade space. The drawing labels 1.97 inches; use the explicit text minimum of 2. |
| 37 | Existing fabric/lift/height bracket selection: Louise at 60-inch height uses 4½-inch bracket. Persist selected bracket plus derived minimums and both measurements. |
| 29–33, 38 | Inside-mount roll-diameter/depth and custom-valance splicing/rounding not completed by this patch; these branches remain held. |

Motorization Guide 2026-09-16 pp56–59 and 94 remains the existing source for control, power, dimensions and charging allocations; September retail tables remain the pricing source. No dealer factor, freight assumption or selling-price policy was changed.

## Saved and server behavior

`smartfold_clearance_v1` stores separate screw-area and shade-space heights using an explicit atomic Save control, preserving unsaved edits when stale server props arrive. Server repricing recomputes `norman_assembly_v1.outsideClearance`, including bracket, measurements, minimums and source page. Missing or insufficient measured clearance hard-blocks customer pricing.

Current selections use `-norman-smartfold-outside-2026-09-20-r8`. Prior r7/r6 identities remain recognized, are not granted this new eligibility, and do not acquire new clearance requirements when replayed as historical selections. Explicit current repricing uses r8 and requires current evidence. Existing snapshots are not rewritten.

## Verification

- Full suite before final excluded-option tightening: 5,919 passed, 28 skipped.
- Final focused rules + actual CRM backend suite: 26 passed; TypeScript no-emit passes.
- Actual backend checks all 15 current ordering fabrics; valid clearances; missing, 0.749-inch screw area and 1.499-inch shade space; invalid motor width; Louise 73-inch No Valance; inside and AutoWand held branches; positive customer-eligible price and saved source record.
- Exact B0342 scenario (Louise F1709, 36 × 60, outside, No Valance, Smart rechargeable, Basic Remote, Right motor, Hub No, six-inch fold, Back/Wall Raceway, no shims, quantity four): included two charging kits; two extra kits plus three extra cables add $215 once at the September retail accessory rates. JSON save/reopen preserves configuration, allocations and total.
- Atomic draft tests cover rapid edits, stale-prop arrival, save and reopened values.

## Production proof remaining

Parent owns integration/deployment. After deployed refresh, reopen internal B0342, record measured 0.75-inch screw area and 1.5-inch shade space only for this verification fixture, save clearance atomically, then save/reopen. Confirm price/customer eligibility, four motors/two included kits, counted extras and persisted source record. Change screw area to 0.749 or shade space to 1.499 to prove the exact server hold, then restore. Do not send the verification quote.

This is a bounded verified branch, not completion of all SmartFold configurations. Inside mounting, all other power/lift modes, valance/common-valance options, optional accessory branches and October-effective motors still need separate evidence/rule closure before enabling automatic customer pricing.
