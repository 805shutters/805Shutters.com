# Norman SmartDrape finite source review — September 20, 2026

Reviewed from release `5ea24a1430157dcbdf57afd717382eb196fe3669` in an isolated worktree. This is a source/code review and tested correction, not a new dealer comparison or a whole-family production-pricing certification.

## Sources and bounded coverage

- `norman-perfectsheer-smartdrape-guide-2026-09`, PS-SD Guide PDF pages 4–27; manifest SHA-256 `3d00375007c3afb0d8e1cf0e75a51f2395d27dace067074f01033b72f70461a3`. Local source: canonical `outputs/catalog-audit-2026-09-17/current-sources/PS-SD Guide.pdf`. Pages 17/19 define finished shade height, and page 23's rendered wand table was inspected directly.
- `norman-motorization-guide-2026-09-16`, September 16 motor guide PDF pages 45–52; manifest SHA-256 `85c5fd2c0d813c879d22776b73f23132243454376b15e52c9451b4cb1f20c1b8`. Local source: `/Users/michaelshepard/Documents/805-quote-v2-sources/Motorization Guide 2026-09-16.pdf`.
- Existing August 11 coordination records and September retail pricing were cross-checked through the generated 77-color catalog, source-price schedules, prior reconciliation ledger, and focused exact-backend tests. No account price, availability, factory alias or revised pack rate was inferred.

| Source branch | Existing destination/implementation | Review result |
|---|---|---|
| Stack/application and dimensions, pp 5–8 | SmartDrape current product/programs; family rules; tracks and paired-order records | Manual/motor stacks, independent pair widths/equal height, paired center join and area limit represented. Pocket finished-height validation corrected below. |
| Stacking tables, pp 9–16 | 246 generated rows; track record retains source row, vane count, stacking width, field of view, deductions | Existing coverage retained; exact 30 motor source conflict remains below. |
| Mounts/hardware, pp 17–22; motor pp 50–52 | Wall, ceiling, pocket; bracket/shim/clip/screw counts; hang strips, SmartJoints and selected keystones | Documented choices represented; bracket and pocket table holes remain held. Dimensional reference drawings are installation guidance, not an invented universal clearance rule. |
| Manual wands, p 23 | Coordinated color, side/count, custom 12–90-inch drop, standard source height tiers | Found and corrected standard drop using order height instead of finished shade height. |
| Alternating colors and six-vane packs, p 24 | Same-category exact colors, end/middle composition, odd/even end identity, extra wand counts; separate standalone-pack destination with original WO | Represented. Standalone source-price conflict and original-order availability remain held. |
| Fabric/hardware coordination, pp 25–27 | 77 current source colors, both base routes, separate RD surcharge, six hardware finishes, charging-wand coordination | Existing exhaustive color-route tests pass; F2128–F2130 factory aliases remain blank. |
| Motor dimensions/components, motor pp 45–48 | Rechargeable/AC choices, left motor, accessories, explicit counts, versioned charging-kit allocation | Represented. Battery-version LED behavior is installation information, not a separately selectable SKU. |
| Controllers/network, motor p 49 | Remote channel 1–5, controller/hub quantities, existing WO, SmartDial rings, repeater limits and order records | Represented; shared-remote work remains owned by the separate PerfectSheer agent. No overlap edited. |

## Implemented correction

For a ceiling-pocket order, guide page 17 defines `Y1 = ordered height − hang-strip height`; page 23 uses Y1 for the standard wand drop. Previously an order 70 inches high with a 2-inch hang strip incorrectly derived a 40-inch wand. The corrected result is finished shade 68 inches and standard wand 36 inches. A custom 48-inch wand remains48. Missing/invalid pocket geometry leaves the default unknown instead of inventing an order-height default.

The family validator now rejects a finished shade below 24 inches after a hang-strip deduction. The 237-square-foot limit uses finished fabric width × finished shade height. Example: ordered285⅝ ×124, pocket depth 6 and pocket height 4⅛, produces finished fabric280⅛ ×121¹⁄₁₆; its fabric area is below 237ft². The same ordered dimensions on a wall exceed 237 ft² and remain invalid.

Ordered dimensions continue to drive the existing retail grid. No new grid heights above 144 were introduced; existing catalog-date gates, historical prices, catalog IDs, dealer factors, freight and selling policy remain unchanged. The derived record retains order height and finished height separately, and the wand now records its height basis and headrail-to-wand-end measurement. Server re-derivation replaces stale/forged defaults and survives JSON save/reopen.

## Exact external exceptions retained

1. **Motorized center-opening bracket interval:** motor p 50 ends three brackets at 94¼ and starts four above 94½. For `94¼ < width ≤94½`, no interpolation or substitution from the older guide was made.
2. **Motorized pocket depth:** motor p 52 documents depths through 8⅞ and from 9; `8⅞ < depth <9` has no stated arrangement.
3. **Exact30-inch center opening:** PS-SD p 8's open-gap table begins strictly above 30. Additionally motor p 45 labels minimum track 30 with shade 27⁷⁄₁₆, while PS-SD p 16 states shade width equals track minus5⁹⁄₁₆, giving24⁷⁄₁₆ at 30. Norman must resolve both exact 30 references; the existing general deduction was not silently changed.
4. **F2128/F2129/F2130 factory identity:** the coordination source's factory alias fields remain blank. The customer ordering codes and their current source destinations are retained; no aliases synthesized.
5. **Standalone six-vane pack price/availability:** guide p 24 says standalone price differs and requires original WO; retail page 24 gives one with-shade/standalone schedule. The separate replacement-pack destination stays held for manufacturer price and original-order availability confirmation.
6. **805 account evidence:** current dealer factors, freight/oversize/processing treatment and representative dealer comparison remain separate account-evidence obligations. This review does not clear the family/account completion gate.

After the pocket correction, no additional independent, source-supported implementation branch was identified in the bounded SmartDrape guide sections above. This finding does not claim that external evidence gaps or all production verification are complete.

## Validation and production follow-up

Validation passed: **154 tests across 8 files**, `npm run typecheck`, and `git diff --check`. Focused SmartDrape, family-rule and exact quote-backend tests cover all existing colors plus pocket wand thresholds, custom overrides, missing geometry, minimum finished height, area, historical behavior, stale derived records and save/reopen equivalence. The exact-backend test verifies 70-inch ordered retail dimensions and identical wall/pocket base pricing despite different 40/36-inch default wands.

Pending release/live proof: in an internal unsent SmartDrape draft, save a 36 ×70-inch F1124 manual Stack Left/Right wand configuration with Outside Mount, Ceiling Pocket Mount, depth 6 and height 3⅜. Verify source-derived shade 68/default wand 36 if visible; custom 48 remains48 after save/close/reload/reopen. Change ordered height to 25¹⁵⁄₁₆ and verify the minimum-height rejection; restore 26 and verify that rejection clears. Keep all source/account pricing holds and never send/order. No production result is claimed by this document yet.
