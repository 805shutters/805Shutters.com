# Sundance assembly records — September 20, 2026

## Implemented boundary

A versioned `sundance_assembly_v1` object is retained inside the existing design `options_json`. Existing catalog IDs, quote snapshots and financial history are unchanged. Each component has its own stable identity, exact product/program/fabric configuration, width and height. Common-headrail assemblies support two or three component records where the existing family selection exposes them; roller dual and coupled configurations support two records. Coupled configurations also retain the component containing the shared motor.

The editor initializes records only by an explicit action. It copies selected fabric/control settings but does not invent component dimensions or duplicate parent accessory quantities, manual prices or pricing snapshots. Each component can be independently edited with the existing family controls. Nested assemblies, mismatched product families, duplicate identities, unknown versions, stale parent assembly selections, missing motor ownership, invalid materials, unavailable grid cells and invalid individual dimensions are blocked by shared saved/server validation.

Source base retail is shown separately for each component using that component's own program and dimensions. No sum is represented as a complete assembly or customer price. Existing family assembly holds remain until the remaining geometry, mixed controls, hardware and dealer pricing conditions are verified. Portfolio's112-inch common-headrail maximum and standard Flat/Knife Pleat/Front Slat restriction, and Walden's108-inch headrail maximum, are explicitly checked. Component widths cannot exceed the complete side-by-side assembly width; gaps/deductions are not inferred.

Both native contract details and the public design formatter emit dimension/fabric/control descriptions. They do not serialize internal component IDs, catalog program IDs, raw configurations or source/account financial metadata.

## Validation

-27 focused component tests: JSON round trip, independent dimensions/grids, exact horizontal IDs and family destinations, stale/cross-product/nested/malformed records, controls/size/identity validation, shared motor reference, recursion prevention and customer-safe descriptions.
-584 Sundance/shared-rule/detail-format tests passed. TypeScript checked separately.
-Production save/reopen and customer-output proof pending deployment.

## Finite remaining model work

1. Walden twin: woven front and movable liner need different component roles and liner schedule/control allocation, rather than two copies of a complete woven shade.
2. Europanel: retain individual panels, track channels, overlaps and stacking geometry from source diagrams.
3. Shared order accessories: stable connected shade/component references, capacity validation and one charge per shared unit, including18-motor power distribution and mixed adapters.
4. Assembly geometry/control integration: reconcile family-specific common-valance/headrail, gap/clearance and mixed-control compatibility; separate one-time hardware from per-shade options. Retaining component records does not finish these rules.
5. Published privacy channel/bar lengths and quantities, manufacturing diagram/footnote closure and exhaustive source-to-rule coverage.

External dealer/account evidence remains separately tracked in the completion matrix; these code branches are not classified as external blockers.
