# Finite Roller and Onyx closeout

This classifies the audited, captured source scope. It does not certify missing external evidence as complete.

## Norman Roller

Implemented source branches: exact fabric identities/price groups/roll widths; shared/common valance records; confirmed physical tube and group hardware; Valance Only and Separate Valance destinations and source choices; shared motor-panel membership/capacity; measured hold-downs; chain defaults/custom dimensions and safety conditions; one complimentary order pole and counted extras; Basic/Premium Wood Light Guard finishes, mounting, channels and one-set quantities. Source references and tests are recorded in this folder's RESULTS.md and the earlier roller-valance-only and onyx-audit ledgers.

Magnet, chain, pole and Light Guard increments are now deployed. Positive source prices and exact negative rules have been verified in production; all four accessory branches completed full reload and reopen. The copy-remap release also passed fresh-copy/full-reload proof in D805-0377, and source A805-0361 was independently reopened unchanged. Valance-containing verification quotes keep customer output blocked because their standalone prices remain unresolved.

Exact remaining evidence:

| Item | Required evidence | Current behavior |
|---|---|---|
| Traditional hold-down | Whether included or separately charged; Roller p43 lists availability but retail does not resolve charge | Explicit pricing hold |
| Valance Only / Separate Valance | Current standalone rate, availability, freight and any shared charge allocation | Exact selectable destinations, held customer price |
| Common valance | Authoritative retail width and shared allocation across mixed/member controls | Shared records and hardware; price hold retained |
| Factory bracket selection | Dimension thresholds (p70/p73) and custom-width rounding (p74) | Does not infer factory bracket from largest confirmed tube alone |
| Inside coupled raceway shims | Factory shim quantity for the pre-screwed inside coupled raceway brackets (guide p41/p74); the guide does not specify a count | Shim-bearing inside coupled branch held, unshimmed documented branch retained |
| Premium Wood Light Guard >96 inches | Wood-specific splice schedule; p45 diagram occupies Basic row | Explicit hold rather than borrowing Basic rule |
| Other wood Light Guard finishes | Effective date of 30→35mm running change (p45) | 30mm recorded, pending-change status explicit |
| Dealer account prices | Current account factors/fees and confirmation of purchasing account | Existing selling policy and dealer-cost separation preserved |

## Onyx

All captured source-backed changes have been integrated and representative saved/reopened proof is in quote805-0333. These include current shutter programs/finishes/frame sides/hinges/application menus; eight new exact shade/Ash destinations,52programs,734color entries; collection-specific Woven liner/binding/control/assembly choices; six exact Signature/Lux baseline profiles containing26fields/84observed values. The source-scoped profile boundary is enforced both in the UI and server. There is no unpublished source-backed Onyx implementation known from the completed captured-menu inventory.

Exact remaining evidence and enumeration after accountCHE01 reauthentication:

| Item | Missing evidence / next finite action | Current behavior |
|---|---|---|
| Signature/Lux/Woven/Ash prices | Current complete grids, effective dates, size boundaries and all surcharge schedules; existing eight30×60cost fixtures are not grids | Every new destination held for automatic customer pricing |
| Lux fabric valance | Capture complete58-name list and exact fabric matching/charges | Baseline profile choices only, no invented identities |
| Full shade compatibility | Enumerate control/color/dimension/mount option dependencies beyond six observed30×60IM/right profiles; motor accessories | Options remain exact-profile scoped and held |
| Woven multiple shades | Individual widths, compatible liners/bindings/controls and shared charge allocation | 2ON1/3ON1 can be recorded but not represented as fully priced assemblies |
| Shutter construction | Specialty, panel/track measurements and material-specific allowances/charges | Source menu choices preserved; unsupported complete configurations held |
| Dealer conflicts/fees | Current account rate, freight, oversize, processing schedule and historical effective dates | Dealer observations remain distinct from CRM selling policy |
| Outdoor shades | Dealer order route plus exact series/fabrics/controls/dimensions/pricing; official public site lists offering absent from captured order menu | Exact unresolved offering, no fabricated destination choices |
| Sunscreen bottom color | Resolve conflicting White annotation versus observed Silver with Round bottom | Only exact current captured profile used |

The dealer Forms page exposed only order sheets, check-by-fax and a2020manual; no current shade-grid download was available in that authenticated menu. Login is now pending, and further enumeration cannot be claimed completed. Original populated dealer tabs and unsubmitted drafts123322/123323/123324 are preserved. Source records and per-color status are in outputs/onyx-audit-20260920/{RESULTS.md,shade-mapping-ledger.csv,observed-option-profiles.md}. No sample dealer rate was substituted for a full customer price schedule.

## Production-discovered copy association repair

While making B/805-0372 from A/805-0361, Copy Current created new shade IDs but retained original IDs inside Separate Valance associatedLineIds. This is an implementation defect, not a source-evidence gap. A/805-0361 remains unchanged. The narrow server-copy repair remaps only explicit user-selected line links (Roller valance v1 associations, Palladian accompanying_line_id, and side_by_side_match_line_id) using the exact deterministic new IDs. Unknown/dangling links remain available to validation; grouping labels, notes and unrelated objects are not rewritten. Price snapshots are still stripped by the existing boundary, and trusted quote-wide repricing reconstructs derived records.

Regression checks exercise the real copy operation generator, retry determinism, both shade associations, typed-version boundaries, unknown links and immutable source configuration/historical money. 14 focused tests and typecheck passed. Existing already-copied drafts are not silently migrated; a fresh copy will provide live verification after deployment.

The ten-alternative failure is also repaired: the shared label helper previously exhausted A–J and emitted "Option 11", rejected by the server/SQL A–Z constraint. It now uses A–Z. At26, the server returns an actionable409 before creating a partial quote; Add/Copy errors remain inline instead of disappearing with a toast. Tests exercise K creation through the authoritative draft parser, Z, full exhaustion/no write, existing gap filling and previous copy regressions (23passed plus typecheck). No source quotes are rewritten.

Final bounded review found no remaining independently implementable rule among the captured Roller accessory/common/standalone-valance gaps. The listed source/account/factory holds remain exact exceptions. A–Z parent production proof is tracked separately; K is server-tested in this branch. Onyx further enumeration remains login-dependent.
