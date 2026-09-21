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

## Divider-independent split proof on 850ed5f1

Copied A into separate0353C. Kept both panels No divider rail. Saved Split Tilt Yes; panel1 Custom with frame-bottom datum/reference64.5, requested location32.25 to top of closed louver, exact-locationYes and explicit reference confirmation; panel2 Equal by louver count, without inventing a numeric center. Saved negative panel1 location64.5625 plus unchecked reference confirmation returned both explicit position/reference server failures. Restoring32.25 and confirmation removed both while retaining actual louver/final-rail and application holds. Closed/reopened0353C: modes, datum/reference, exact election,32.25 and checked reference confirmation persisted; no phantom divider rails appeared. Draft remains unsendable. Actual section-count entry is in the next release and is not claimed verified by this proof.

## Actual section-count and bypass-routing proof on 4c38a3e4

Reloaded the production CRM and used existing 0353C. Saved synthetic panel 1 section counts 1/8 (bottom/top) and panel 2 Equal counts 8/9. The saved server audit rejected the one-louver outer section and the misplaced extra odd louver. Restored panel 1 to 8/8 and panel 2 to 9/8, saved, and verified both count errors disappeared. Application geometry and final rail/layout verification holds remained. These are test inputs, not a factory-approved louver layout; the internal job notes explicitly state that limitation.

Closed the builder, reopened 805-0353 and selected C. Verified 8/8 and 9/8 persisted with the original panel 1 custom 32.25-inch location, 64.5-inch frame datum, and panel 2 Equal mode without a fabricated reference height. Job notes persisted; Quote saved, no unsaved panel changes, and Send Quote disabled.

Selected saved 0353B and reopened its pricing audit. The stale regular-panel stile error is gone. Closed Bypass, two 24×60 panels, Semi-Inside Mount, both side frames, interlocking guide Yes, and 47.875×61.125 source reference all persisted. Only the specialized-construction verification message remained in Saved configuration. Known base cost $262 remains explicitly incomplete; these proofs do not approve track pricing or landed cost.

## Specialty identity/frame proof on 7be5403e

Copied0353A into independent0353D and selected Woodlore Plus. The deployed specialty selector exposed all46 exact identities. Saved YS15 Circle Sunburst, Frame Include In Rail Yes, Crown Z3-inch frame/all-around, no hinges or magnets, no hang strip behind, one24×24-inch net panel with no divider, No Motor, Inside Mount,3½-inch louver,001Pure White, Standard Tilt and No Split Tilt. The UI narrowed the frame menu to its five eligible Z frames and removed Yes from hinges/magnets. Generic hinge color was still exposed even for this no-hinge record (Pure White supplied); this presentation/compatibility refinement is tracked separately.

Saved negative hub12.0625inches and net width15.4375inches. The completed server audit returned both exact maximum-hub and15½–84 net-size failures. Restored hub12 and net24×24, saved; both errors disappeared while specialized geometry/template/account holds remained. Closed/reopened0353 and selected D: exact identity, frame/fixed-hardware state, hub and net dimensions persisted with no unsaved changes. Send Quote and Payment Link remained disabled; the$291 known base cost was marked incomplete, with add-ons unresolved and margin withheld.

Internal notes explicitly identify synthetic geometry and no template acceptance or pricing approval. The initial notes edit made immediately after saving panels did not survive the first reopen. A separate edit followed by blur and verified Quote saved did survive a second close/reopen; final persisted notes are correct. This does not establish a root cause for the initial note behavior. No quote was sent, sold or ordered. This representative proof does not certify all46shape combinations or specialty pricing.

## Specialty outline, lower section and manufacturing proof on b63930ec

Saved0353D Circle Sunburst with source-required solid Crown Z frame manufacturing, distinct24×24 order outline, Not an arch, existing moldingNo, and blank template reference. Closed/reopened and verified these values persisted alongside its original net panel and fixed hardware. The canonical Inside Mount template check was missing in the live server because the adapter supplies `inside`;774e757b repairs that alias with a real-adapter regression test. The universal specialty hold still prevented sending. Do not count this pre-fix run as successful template enforcement.

CopiedD to independent0353E. SavedYS68 Left Quarter Sunburst Panel with Continuous Frame, Vintage L/all-around, no hinges/magnets/hang strip, hub12, perfect outline48×100 with leg78 and middle89, finished panel30×100 with lower horizontal section78.0625 and no divider. The completed server audit rejected both middle-height equality (must exceed89) and lower horizontal section above78 without a divider. Restored middle89.0625 and lower section78; saved audit removed both failures while specialized geometry/template acceptance/account holds remained. The frame manufacturing table explicitly reports this exactYS68/Vintage combination unresolved; no style was inferred.

Saved separate internal notes, blurred, and verified Quote saved. Closed builder, reopened805-0353, and selectedE: order48×100, perfect classification, moldingNo, leg78, middle89.0625, distinct net panel30×100, lower section78, no divider, hub12 and blank template reference persisted. No unsaved panel changes; Send Quote/Payment Link disabled. Returning toD confirmed solid frame manufacturing and its distinct24×24 outline. The known$291 base is still incomplete with unresolved add-ons and no margin, not an approved landed cost. All test measurements are synthetic; no template was submitted or accepted and no quote was sent, sold or ordered.
