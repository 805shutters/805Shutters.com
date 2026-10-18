# Mobile quick quote: Option 2

## Customer-facing rules

- Choose the cost multiplier first. Then explicitly choose Apply to All or Individual.
- Required choices use light red buttons, confirmed selections use green, and optional choices use yellow. No separate status badges or routine missing-selection warnings.
- Pricing identities and contract instructions retain their distinct validation rules. Price-neutral contract details such as control side are still required when applicable.
- Manufacturer/product configurators remain the source of available values and conditional fields. Never merge their option lists across manufacturers.
- Choices use side-by-side buttons. Selected choices collapse to a summary with Change. Only color lists retain dropdowns; other long lists use searchable buttons.
- Assembly, hold-downs, spacers, side-cut fabrication, extra valance charge, and wand lengths stay out of the quick quote UI. Existing saved values are preserved. Ordering checks and unsupported automatic-pricing gates remain in place.
- Unknown new fields stay visible as Product choice until mapped; they must never silently become optional, price-neutral, or disappear.

## Product routing

| Product family | Pricing identity and configuration | Contract instructions |
|---|---|---|
| Shutters | Exact manufacturer/program, material, size basis, louvers, frame, panel schedule, tilt, specialty construction | Mount, operation/folding instructions, applicable hinge finish |
| Faux wood / wood blinds | Exact color, slat size, system, source valance/ladder/tape options | Wand/control side, mount |
| Honeycomb / cellular | Exact cell/fabric/color, light control, operating system, specialty shape/day-night fabric when applicable | Mount, manual cord/loop side |
| Roller | Exact fabric/program, system, cassette/valance/hem/hardware as supported | Mount, manual chain side, roll direction |
| Roman / woven | Exact fabric/style/lining/system and supported valances | Mount, manual control side and returns |
| Sheer / layered / Zebra | Exact fabric/vane size, light control, operating system, supported cassette/headrail | Mount, manual loop side and relevant cord/finish instructions |
| Vertical / drapery | Exact vane/fabric/system, source headrail/valance configuration | Mount, draw/stack direction and applicable control side |

These are field purposes, not universal available choices. The exact product route supplies the actual choices. A manual continuous-loop cellular shade requires a side. A cordless cellular shade has no manual cord side. A cordless wand-tilt faux wood blind still requires its wand side. Sundance BasicVue is left-only in the existing guide rules. No wand-length prompt is added to obtain a quote.

## Persistence and sharing

Manufacturer-specific control keys feed the canonical supplier control/system fields. A later native edit supersedes an older supplemental entry. Canonical control_side is included by the existing customer-contract serializer.

Apply to All copies product selections into existing and future openings, while preserving room, opening measurements, notes/photos, quantities and each line's own manual price. Opening-specific nested dimensions and computed prices are never copied. Changing mount invalidates measurements that had a different meaning. Individual disables the old implicit previous-family repeat. An inherited blank next-opening placeholder is omitted during review.

## Verification scope

`mobile-option-parity.test.ts` inventories 61 supported catalog products and 296 product/program baseline states. The JSON report retains exact per-product field lists and intentional quick-quote omissions. This baseline inventory does not claim to exhaust every conditional combination. Focused tests exercise manual continuous loop versus cordless, faux wood side requirements, BasicVue left-only, native-side precedence, supplier serialization, customer-contract text, shared selections, and selected-button collapse/reopen.

Development-only real component preview: `/quote/mobile-quick-preview/`. Preview data is held in component memory and never submitted.

Measurements use the shared calculator keypad and fraction buttons, with direct keyboard entry disabled in the supplier quote sequence.
