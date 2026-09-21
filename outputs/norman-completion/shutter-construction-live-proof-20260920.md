# Norman shutter construction live proof

Internal native quote **805-0353**, customer `Norman Shutter Construction Internal Verification 2026-09-20`. No customer contact information; internal notes prohibit sending, selling or ordering. Draft only.

On deployed ce375e05, selected Norman Shutters / Woodlore through the exact price-program picker. Saved 48×60-inch Office opening, Bi-fold 180 LL, no motor, two finished panels each 24×60 inches without divider rails, flat mounting surface confirmed, no casing, measured reference 48×60, 3-inch header, plain fascia, zero header extension/baseboard/buildout, required bottom pivot L bracket and 1.75-inch light-block extension. Displayed source frame reference 51.5×64.5. Closed builder, located 805-0353 and reopened: all of these fields persisted. Pricing remained incomplete and Send Quote/Payment Link disabled.

**Defect found:** top program selection omitted old material_type/composite_subtype metadata, causing the separate louver/color/mount/stile grid to stay hidden. Fixed in 795fbc91 with saved catalog-selection round-trip tests across all six programs. No destructive same-program reselect workaround was used. Live option and saved negative-width proof await that deployment; the intermediate panel-width edit was restored to 24 inches before close/reopen. Do not claim the pricing engine verified an invalid width while required choices were inaccessible.

## Completed option and negative-case proof on 4b2bd345

After a full reload, the existing 805-0353 native selection exposed its controls without changing the program. Saved Outside Mount, 3½-inch louvers, Standard Tilt, 001 Pure White, Pure White hinges, 2-inch Butt stiles, and No Split Tilt. The existing LL panel/header/casing record remained intact.

Saved **24.0625-inch panel 1 width** and **1.5-inch light-block extension** with the bottom pivot L bracket required. The completed server pricing audit returned both exact failures: panel width must be 6–24 inches, and the pivot requires a 1¾-inch light-block extension. Restored 24 and 1.75, saved, and verified both errors disappeared; only specialized-construction verification remained in the saved-configuration list. Closed the builder and reopened 805-0353: all options, two 24×60 panels, flat surface, casing basis, 48×60 reference, 3-inch header, plain fascia, zero extension/baseboard/buildout and 1.75-inch light block persisted. Quote saved; Send Quote and Payment Link remained disabled.

This proves this representative Bi-fold 180 native save/reopen and two negative server cases. It does not certify complete track geometry, all six programs or pricing. The audit's $262 known base was explicitly incomplete, with add-ons unresolved and margin withheld; it is not an approved all-in dealer cost.

## Closed Bypass proof on 850ed5f1

Copied0353A to separate0353B, preserving A. Saved Closed Bypass, two single side-open panels24×60, no motor, Semi-Inside Mount, both side frames, 48×60 window, interlocking guideYes. Displayed reference47.875×61.125. Saved negative width36.0625 and guideNo returned the exact6–36 width and required-guide server failures. Restored24/Yes; closed/reopened0353 and switched B: all fields and distinct Semi-Inside persisted, no unsaved changes, pricing/send remained held.

Copying from Bi-fold exposed a stale regular-panel stile validation message on the bypass path, even though those controls are hidden. The follow-up routing repair omits regular frame/stile/closure checks only for current typed bypass applications, preserving stored fields and historical behavior. Specialized track geometry remains blocked and full bypass stile construction is still an explicit unfinished rule branch.
