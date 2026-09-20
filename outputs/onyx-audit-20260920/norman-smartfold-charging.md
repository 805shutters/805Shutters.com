# Norman SmartFold charging allocation — September 20, 2026

Implemented from the September 16 motorization guide; no dealer factor, selling policy, legacy snapshot or unrelated availability hold changed. Parent must integrate/deploy and perform live proof before calling this verified live.

## Exact evidence

| Source | Page (PDF) | Source requirement implemented |
|---|---:|---|
| Motorization Guide 2026-09-16 | 57 | Norman Smart rechargeable: one 36W charging kit per three motors, rounded up per order; extra kits no more than shade quantity in the same line. Kit uses black 36W adapter (~59-inch lead) and black 6-inch connector. |
| Same | 57 | Optional 78.74-inch extension; rechargeable matches black 36W charging adapter. AC 36W standard white, AC 65W standard black. 36W and 65W extensions are incompatible. Black 36W AC is separate-parts-order only and is not offered here. |
| Same | 94 | AutoWand: one charging kit per three motors, minimum one per order; extra kits limited by line shade count. Kit white 78.75-inch cable; 5V USB charger excluded. USB/USB-C is a factory-matched running change. |
| Same | 94 | AutoWand extension 118 inches, explicit White or Black, maximum one per AutoWand. |
| 2026Sep Retail Price Guide | 7 (printed 6) | SmartFold Norman Smart charging kit $43 and extension $43 suggested retail. Existing canonical catalog prices retained. |
| Same | 8 (printed 7) | AutoWand charging kit $45 and extension $43 suggested retail. Existing canonical catalog prices retained. |

Motor guide SHA256: `85c5fd2c0d813c879d22776b73f23132243454376b15e52c9451b4cb1f20c1b8`.
Retail guide SHA256: `3767de1e04ee7c8dc6bab14a6224868e4ca366f2ec4be2d8d3d13ec5cf45aafd`.
Sources: `/Users/michaelshepard/Documents/805-quote-v2-sources/Motorization Guide 2026-09-16.pdf` and `/Users/michaelshepard/Documents/805/outputs/catalog-audit-2026-09-17/current-sources/2026Sep Retail Price Guide.pdf`.

## Saved, UI and server behavior

- New typed `smartfold_charging_v1` holds extra kit count, extension count and AutoWand extension color. Explicit **Save charging accessories** sends one complete atomic record. Unsaved edits survive stale props and server acknowledgement of an older submission.
- UI bounds counts and availability to selected power; server independently rejects malformed/noninteger/negative counts, kit quantities over line shade count, incompatible power, AutoWand extensions over shade count and missing/invalid AutoWand colors.
- Counts price once per line via canonical motor accessories. Four shades with two extra Smart kits and three extensions add $215 suggested retail; AutoWand adds $219. Neither amount is multiplied by four. Dealer cost and customer selling policy remain their existing independent calculations.
- Server reconstructs included kits and connected line IDs; alphabetically first line owns fulfillment. Smart rechargeable and AutoWand are separate SmartFold groups, not pooled with other product families. Common-valance SmartFold lines retain their own shade quantities, not a fabricated two-motor multiplier.
- Persisted accessory connector/color follows the order-wide AC adapter after mixed-order derivation. Removing the 65W-requiring line restores compatible 36W white AC extensions. Rechargeable extensions remain black 36W.
- Catalog revision `norman-smartfold-charging-2026-09-20-r7` applies on/after September 20. Earlier behavior remains unchanged. No historical quote loading is used to reprice.

## Verification and remaining live proof

Focused 20 tests pass; full suite 5,847 passed / 28 skipped; TypeScript passes. Coverage includes ceil boundaries 1–10 motors, separate families, owner reassignment, forged record replacement, JSON save/reopen, mixed-product adapters, exact price totals, invalid counts/power/color, unchanged historical behavior and atomic form state.

Production proof required after parent deployment:
1. Two SmartFold rechargeable lines, quantities 2 + 2: included kit order count 2, fulfillment only on one line; add two kits and three extensions to a quantity-4 line and confirm $215 suggested-retail increment in authoritative breakdown.
2. AutoWand quantity 3: choose two kits, three Black extensions, Save once; reopen and retain all three fields. Authoritative suggested-retail increment $219, included kit count 1, no USB wall charger implied.
3. Set AutoWand extensions to 4 or extra kits above shade quantity: server blocks. Switch to AC/cordless with stale extra kits: server blocks until counts cleared.
4. Combine an AC SmartFold extension with an existing eligible 65W-requiring Norman shade: record Black/65W. Remove that shade: record White/36W. Save/reopen both states.

Unchanged exceptions: charging-kit pooling between product families, source-conflicting mounting/keystone rules, At Gaps configuration and all unrelated pricing holds are not claimed complete by this patch.
