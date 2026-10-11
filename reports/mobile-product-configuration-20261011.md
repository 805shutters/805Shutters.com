# Mobile product configuration audit — October 11, 2026

The mobile window builder reused the existing supplier configurators but hid the catalog header, which contained the exact supplier-program selector. For products with multiple programs, that could prevent the configuration fields from appearing at all. Pricing-only filters and collapsed sections also suppressed existing order and installation details.

The mobile builder now exposes the exact source-catalog program selector, the full existing configuration controls, and expanded installation/options sections. Desktop behavior remains unchanged. Program changes use the existing catalog boundary logic to clear incompatible selections while preserving manually set line prices. Options remain conditional on the actual selected supplier program, mount, frame and application; this change adds no fabric codes or supplier choices.

| Coverage in isolated mobile tests | Fields verified |
| --- | --- |
| Onyx and Norman shutters | Louver size, source color, frame type, frame sides, panel configuration, tilt type, split tilt, divider rail and divider location; selected values survive the frozen submission specification |
| Standard faux wood and wood blinds | Mount, slat size, color; existing wand, valance, common-group and installation options remain available |
| Roman, sheer, roller and honeycomb shades | Mount, fabric and operating system; roller valance; conditional motor power controls |
| Vertical blinds and drapery | Mount, source fabric/material, stack and control options |
| Norman Contract faux wood and vertical | Source finish/slat selector, mount, wand side/drop, conditional inside-mount fit/depth, valance or headrail, bracket/spacer or shim fields; Contract Sales manual-quotation warnings retained |

Source implementation: `DesignCard.tsx`, its supplier-specific component routes, `ui-catalog.ts`, `onyx-current-assortment.ts`, `norman-shutter-assortment.ts` and `norman-contract.ts`. Dedicated mobile supplier panels now receive full configuration mode instead of pricing-only mode. Tests use actual local catalog choices and synthetic customers/measurements, with external requests blocked.

The multiplier appears once on final review, after tax and notices and immediately before Submit. It is in normal document flow and absent from the window builder footer.

## Operating sequence

1. Choose family, manufacturer and exact product; enter the room and measured dimensions.
2. Choose the exact supplier program when offered. Complete its configuration, including conditional frame, panel, control and installation fields. Use the supplier handoff fields only for confirmed details that are not captured by the source controls.
3. Save the opening and repeat for the remaining openings. Review all openings and correct missing specifications.
4. Resolve tax and fee treatment using confirmed instructions. Choose the profit multiplier as the last selection before Submit.

Supplier processing remains disabled in production pending the separately authorized supplier integration. No queue migration, customer mutation, supplier order or quote send is part of this UI change. These checks establish parity with implemented source configurators, not a fresh supplier-portal audit of every possible specialty product or program. Missing or unsupported supplier details must remain explicit blockers rather than invented defaults.
