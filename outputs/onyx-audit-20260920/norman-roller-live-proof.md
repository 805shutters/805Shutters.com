# Norman Roller live proof — 2026-09-20

Internal customer `Norman Roller Assembly Verification 2026-09-20`, quotes **805-0346 (A)** and **805-0349 (B)**, dedicated Chrome tab **1585237037**. No contact details, sends, sales or orders. Original manufacturer/customer tabs preserved.

## Alternative A: hardware

Live release 8d2fa5c9. Soluna Roller / Amelia F1484 Mist Gray (Fabric PG2), 36 × 60 inches, outside mount, Single Shade, Motorized, 1¾-inch (43mm) tube, Automate Low Voltage DC Motor, No Valance / No Top Treatment, quantity one.

Base completed configuration saved at **$1,237**, including installation $25 and shipping $14. Atomic hardware edit: Back / Wall Mount, two shim layers, optional raceway selected. Saved total **$1,332**, with audit **Shim $28** and **Raceway $67**, base $346 + fabric $38 + operating $814. Closed builder and reopened 805-0346: all three hardware selections and $1,332 persisted.

The new shared-panel control was hidden because production generic picker saves `power_configuration` while component initially read only canonical `roller_power_configuration`. Narrow alias fix committed separately and deployed with release 134fef73; panel proof passed below.

## Alternative B: common-valance membership

Copied A into alternative B / quote 805-0349, changed to Common Valance / Square Fascia and copied the shade line. Saved same assembly name `Roller common proof`, left positions 1 and 2, gaps 1 and 0 inches, matching return selection None, no custom width. Source-derived expected span/finished width: 73 inches. Prices correctly remain held. Staff audit explicitly reports the saved common assembly and unresolved shared-valance charge-width/allocation basis requiring dealer confirmation.

Full browser reload/reopen membership proof passed: both names, positions, gaps, return selections, Square Fascia, and the pricing hold persisted. The reopened staff audit states: “The common-valance assembly is saved. The retail guide does not establish the shared valance charge-width/allocation basis; dealer confirmation is required before automatic pricing.” Both lines remain $0, two windows need pricing, and Send Quote is disabled.

## Alternative C: shared panel — verified live on release 134fef73

Copied A into **805-0350 (C)** to preserve both prior fixtures. Two identical Single Shade / Automate Low Voltage DC lines with quantities four and five total **$11,988** before panel selection. Connected both to **Panel 1**: total **$13,121**, exactly one **$1,133** increase. Owner line totals $6,461 (four × $1,332 plus $1,133); other line totals $6,660. Staff audit confirms **9 of 18 motor connections**, one panel charged on the owner, and a distinct $1,133 order charge.

Changed second quantity to 15 (19 combined motors): both prices became zero, pricing incomplete, and Contract displayed the blocking gate. Staff audit explicitly requires a valid shared allocation with at most18 motors. Restored second quantity to five: $13,121 returned.

Closed builder, fully reloaded browser, reopened 805-0350: both Panel1 memberships, quantities4/5 and $13,121 persisted. Customer preview initially displayed temporary incomplete alternative sections while loading; after settling, A correctly showed $1,332, C showed $6,461+$6,660=$13,121, and only B retained the intentional pricing exception. Fabric F1484, 36×60, motor and DC Distribution Panel choices appeared correctly. No send/order/payment action performed.

This proves this representative panel and hardware configuration under existing selling policy, not dealer account applicability or all coupled/dual combinations. Included cord/harness quantities,18-motor exact boundary, mixed compatible products and owner deletion are covered by automated tests; not claimed as separate live fixtures.

## Common-valance fallback audit correction

Live B0349 showed a legacy Coupled Shade $117 audit component. The current authoritative server correctly held the entire common-valance price, but the UI fallback recomputed that incorrect legacy assumption. Roller Guide PDF p37 distinguishes shared common valances from coupled hardware; September Retail PDF p20 applies $117 specifically to coupled shades (one/two/three charges for two/three/four shades). Authoritative V2 audit no longer adds the coupled charge merely because the saved shade type is Common Valance. Legacy calculation behavior and saved price snapshots remain unchanged; the actual shared-valance pricing hold remains in force. Focused validation:57 tests passed and TypeScript no-emit passed.
