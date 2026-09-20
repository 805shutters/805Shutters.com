# Roller common-valance membership — September 20 increment

Source: Roller Shade Guide 2026-09-16.pdf, SHA256 `81114d0186dff48a54848d315059f52330ee506e589a49a5e3df11aed0c896fc`.

Implemented typed atomic `roller_common_choice_v1` (group, position, gap, returns, optional custom end-to-end width) and server-rebuilt `roller_common_valance_v1`. The derived record retains every selected shade's line ID, width, height, fabric, motor power, ordered position and gap. Reordering/removing a line recomputes the group.

| Page | Source-backed validation/record |
|---|---|
| 37 | 2–6 members; Cord Loop/SmartRelease/AutoWand restricted to two. Same lift/power, mount, valance and assembly quantity. Cordless member order widths must exceed 20 inches. Additional gaps 0–12 inches; rightmost following gap zero. Limited systems' control sides left/right. |
| 37 | Different tube selections cannot silently remain unequal; group records the requirement to upgrade every tube/clutch/fascia/bracket to the largest requirement. |
| 38 | Actual common valance required. Fabric/Modern Wood returns only outside or semi-inside. |
| 39 | Custom width ≤ ordered widths plus gaps plus 12 inches. General 570-inch maximum, 190 for the limited controls. Records the minimum joint count implied by the 95-inch piece ceiling without claiming it is the complete material-dependent splice schedule. |
| 58 | Inside ⅛-inch deduction occurs once across the common span. Outside no deduction. Returns add ⅝-inch wood, ¾-inch 8-inch fabric, ½-inch other fabric per return. |
| 74 | Custom bracket rounding remains unresolved, explicitly held. |

Exact unresolved evidence remains visible: September Retail PDF p20 does not establish the shared valance charge-width/allocation basis; the common configuration is therefore preserved but held. Fabric/wrapped fascia splice layout additionally requires the exact valance fabric/roll-width mapping (the dimensional grid does not prove roll width). No shared retail price, splice layout or custom bracket rounding is fabricated. General splice/joinery UI and separate-valance-only product remain further work, not claimed complete by this membership increment.

Current Roller catalog r4; previous r3/r2 recognized without new common restrictions. Focused tests cover exact geometry, return thickness, 20-inch boundary, counts, control sides, gaps, stale/malformed records, quantity/power/tube mismatch, exact holds, atomic save and reopen, and historical behavior.

Production proof: create two selected Common Valance lines in one group, positions 1/2, 36-inch widths, inside mount and five-inch gap after first. Reopen: order span77, finished76.875, both member IDs retained, shared-price exception remains. Delete/unselect second member and verify count exception instead of a stale valid group.
