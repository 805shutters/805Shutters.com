# Onyx baseline option implementation — 2026-09-20

This increment implements the six exact Signature/Lux profiles already captured in `shade-option-observations.json`, joined to the same saved comparison lines in `shade-cost-fixtures.json`. Runtime evidence is independently pinned as `onyx-baseline-options-2026-09-20`. Account CHE01; observed September 20; effective date remains unknown.

| Product | Exact pattern / color / control | Options represented |
|---|---|---|
| Signature Roller | Amelia BO_ZG601 / 20205BO_01 / Cord | Cassette, cassette color, cord color, bottom rail, bottom color, fabric wrapping |
| Signature Sunscreen | 1% SC-1_s1001 / S1001_01 / Cord | Cassette, cassette color, bottom rail, bottom color, no fabric wrapping |
| Signature Zebra | Arcadia BO_A242 / A242_1 / Cord | Cassette, Zebra bottom, bottom color, fabric wrapping |
| Lux Fabric Blinds | 2-inch Light Filtering_FB_PG1 / FB_PG1_50016 / Cordless | Valance, valance color, return, cloth tape, Single/2 ON 1/3 ON 1 |
| Lux Honeycomb | 3/4 Single LF_HC_PG05 / HC_PG05_H45034M / Cordless | Tile cut, Single/2 ON 1/3 ON 1 |
| Lux Sheerview | 2-inch Light Filtering_S50PN / S50PN100 / Cord | Valance, chain, assembly, Standard/Custom cord length |

All six observations are 30×60 inches, inside mount, right control, quantity one. Portal Cord maps to the existing CRM Continuous Cord. The additional menus appear only within that exact saved profile, including exact color and program. They are observations of available menu entries, not certification of all cross-combinations. Missing grids, compatibility, dimensions and charges keep the entire offering blocked for automatic pricing and customer delivery. No dealer label, sample cost, markup or fee is promoted to a customer price.

The 26 fields/84 observed selectable values use one optional versioned record (`onyx_baseline_options_v1`). Local drafts preserve rapid changes across stale server props; Save submits the whole record atomically. Collection/color/control/mount/side changes clear the record. Changing dimensions or quantity preserves the record for inspection but makes it explicitly incompatible, with a clear-record action. The server independently enforces source-profile identity and exact field/value membership; forged fields, changed profiles and unsupported wrapping cannot pass.

Important evidence limits remain explicit: Sunscreen Silver was observed with Round bottom; a previous White annotation remains disputed. Lux Fabric Blinds' separate58-name fabric-valance list and its exact fabric matching/charges were not captured as a complete list and are not invented. Multiple-shade assemblies do not yet have source-confirmed individual widths or pricing. Custom return/cord selections remain held without guessed dimensions or charges. Woven remains handled by its separately verified collection/control source.

Validation: 59 focused tests and TypeScript no-emit passed; final full suite: 5,928 passed, 28 skipped. Source manifest and binary lock include the independently hashed new snapshot. Every one of84 source values goes through JSON save/reopen, the real server adapter, strict profile validation and pricing engine, retaining the pricing/delivery hold. Tests reject alternate fabric/control/dimensions/mount/side/quantity, malformed records, unknown fields and Sunscreen wrapping. Render checks cover all six exact profiles; a rapid multi-field/one-save/stale-prop regression protects atomic persistence.

## Production proof — verified on release 0fcacb9b

Internal quote **805-0333**, customer `Onyx Catalog Verification 2026-09-20`, dedicated Chrome tab1585237061. All six exact baseline profiles rendered. Rapid edits were made locally, then each complete record was saved once:

| Profile | Values saved and reopened |
|---|---|
| Signature Roller | Full Enclosed cassette; Grey cassette; Metal cord; Square bottom |
| Signature Sunscreen | Square cassette; Round bottom; Silver bottom color; wrapping No |
| Signature Zebra | Full Enclosed cassette; Zebra Bottom; Black bottom color; wrapping Yes |
| Lux Fabric Blinds | Westminister; Onyx valance color; Standard return; Black cloth tape; Single |
| Lux Honeycomb | Tile cut Yes; 2 ON 1 |
| Lux Sheerview | Flat Valance; Metal chain; Single; Standard cord length |

Changing the Roller width from30 to31 inches saved an explicit profile-mismatch warning and retained the observed record. Restoring30 recovered all four selected values. Closed the builder, fully reloaded the browser, reopened805-0333, and verified all23 selected values across six records, with no unsaved options. All12 quote lines still require pricing; Send Quote remained disabled and Contract displayed the explicit incomplete-pricing block. No manual price was substituted, and no quote was sent, sold or ordered.

This verifies persistence and profile scoping, not missing dealer grids or conditional compatibility. The separate source tab1585237058 is currently at Onyx Distributor Login; the original populated source tab1585237016 remains preserved. Reauthentication to accountCHE01 is required for the remaining58-entry valance-fabric enumeration and current pricing evidence.

## Remaining Onyx classification

All authored source-backed Onyx implementation increments have been integrated;4c98bd30 was a Norman read-only gap report, not unpublished Onyx code. This new increment is the remaining explicit baseline-menu implementation gap found in the captured shade observations.

Still outside these source-backed boundaries: complete shade/Ash grids and effective dates; exact all-fabric/control option compatibility, limits and motor accessories; complete shutter specialty/panel/track construction and allowances; dealer-rate conflicts and account fee schedules; Woven multi-shade dimensions/charge allocation; outdoor shade identities and ordering route. These require additional manufacturer evidence or portal enumeration and are not labeled completed by the profile menus. No full-assortment pricing certification is claimed.
