# Roller group hardware requirements

Scope: Common Valance and Separate Valance associations, source Roller Shade Guide September 16, 2026. This increment implements deterministic source rules while preserving shared/standalone pricing holds. It does not claim factory confirmation of the complete hardware package.

| Source | Implemented | Remaining evidence boundary |
|---|---|---|
| p37 | Exact largest selected tube diameter; every member must match it. Narrow cordless <=20 cannot upgrade to 2-inch. Separate valance and associated mounting brackets recorded as large. | An ambiguous “Large” or “All Tubes” selection does not specify a physical diameter. Factory selection remains necessary where source does not determine it. |
| p41 | Individual-shade minimum fascia/Fabric Valance size, by lift, width, height and Cord Loop ratio. Coupled widths evaluated individually. | No invented new product or hardware price. |
| p46 | Common group's cross-member restriction: any width >96 or Cord Loop height/width >5, and another physical shade height >72, requires >=4.5-inch fascia. Explicit 3.5-inch selections rejected. | Generic size table does not replace exact fabric matrix. |
| Appendix | Largest-tube candidate checked against exact fabric/configuration profile and dimensions/area. Diameter-specific profile preferred; complete all-tube or unsplit profile may establish dimension compatibility and its scope is recorded. Missing/ambiguous/invalid source profile holds. | Passing an unsplit dimensional profile is not a factory tube/bracket-selection confirmation. |
| p51 | Single/common CCL with raceway: 1.125 tube uses 1.125 clutch; 1.75/2 tube uses 1.75 clutch. | Coupled and SmartRelease clutch selection is not inferred from the single-CCL table. |
| p70 | Exact residual factory-confirmation reason persisted in each group's hardware record. | Bracket applicability is listed, but source does not specify complete small/medium/large size-selection thresholds. |
| p73 | Reference-only status recorded. | Reference mounting chart is not treated as an authoritative factory-selection rule. |

Saved shades retain their actual selected tube. A mismatch gives a precise required diameter and must be corrected in the existing tube picker; the server does not silently replace the saved value. Every repricing rebuilds group membership/hardware from the selected lines. Forged derived hardware is discarded.

Roller current version becomes group-hardware r7; material r6 and all prior supported versions remain recognized. Current standalone/separate valance version becomes r2; r1 remains recognized without retroactive new group-hardware validation. Existing source IDs, line IDs, pricing holds and historical snapshots remain unchanged.

Tests cover seven cordless fascia boundaries, SmartRelease and exact 1:5 ratio, cross-member thresholds, physical coupled widths, unknown tube labels, largest-tube mismatch, narrow-cordless prohibition, exact appendix success/failure, CCL clutch distinction, saved reopen/forged-record rebuilding, separate bracket requirements, and old version behavior.

Validation: 6,276 tests passed, 28 skipped; TypeScript and production build passed. Deployment and live proof remain separate parent-owned release steps.

## Physical tube and association followup

Production proof on the Cordless Amelia F1484 shade uses the valid appendix classification `All Tubes`. That is retained for fabric dimensional lookup. The atomic `roller_hardware_v1` record now optionally stores a separately confirmed physical diameter (1⅛, 1¾ or 2 inches). No default is fabricated. Shared hardware uses that confirmation, checks the exact appendix dimensions, rejects conflicts with a diameter-specific appendix selection and retains the independent factory-bracket and pricing holds. Existing records lacking this optional field parse unchanged.

The Separate Valance UI now receives Roller Shades across the natural-unit Valances product type boundary, then filters Norman identities using the same `fabric_product_id`, `catalog_product_id`, `quote_lab_product_id` precedence as the authoritative adapter. The former same-product-type filter made every Roller shade invisible to the valance picker.

Validation: focused hardware/common/separate tests, parser malformed/legacy cases, unchanged All Tubes profile, saved adapter roundtrip and cross-product UI regression; typecheck. Production verification resumes after parent deployment.
