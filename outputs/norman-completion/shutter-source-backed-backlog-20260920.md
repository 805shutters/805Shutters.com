# Norman shutter source-backed backlog and Bi-fold 180 increment

Reviewed from isolated base 293a9d55 on 2026-09-20. The guides' specific publication/effective dates are not inferred from download names: these are the September audit's pinned full-binder copies in `outputs/catalog-audit-2026-09-17/current-sources`. Page numbers below are absolute PDF pages. This review does not certify all shutter combinations or dealer prices.

## Implemented in this increment

Bi-fold 180 now has an optional version-1 schedule inside the existing `norman_shutter_panels_v1` record. It saves exact layout, a finished width for every panel, and confirmation of flat mounting surfaces for the header, light blocks and bottom pivot brackets. Existing finished heights and divider decisions remain alongside each width. Saving explicitly synchronizes the selected panel layout; a later conflicting layout is rejected by the server.

- Woodlore: LL/RR/LLRR; each panel 6–24 inches (binder pp56–59).
- Woodlore Plus: same layouts and 6–24 inches; AquaShield 6–26 inches, only its existing 2½/3/3½/4½-inch louver assortment (pp73–76). The 1⅞ table cell contains conflicting 24/N/A text; it does not override the explicit assortment prohibition.
- Brightwood: LL/RR/LLRR/LLL/RRR/LLLRR/LLRRR/LLLRRR (pp65–69); Normandy painted/stained same (pp67–71). Two-panel stacks 6–26 inches; three-panel stacks 6–20 inches. Mixed layouts validate each stack independently.
- All six programs require Outside Mount. Semi-Inside is not silently treated as Outside.
- Existing 120/132-inch finished-height limits and program/application-specific divider thresholds continue to apply.

No prices, source authority, catalogs, selling policy or stored historical snapshots change. Earlier-date selections bypass current rules; older records still parse unchanged. Current unfinished Bi-fold 180 drafts receive a precise missing-schedule issue. Every such configuration retains the existing specialized-geometry hold and provisional pricing hold, even when this bounded schedule validates. This is not complete track pricing or an approved order.

## Concrete work that existing sources can support next

| Path | Exact source | Remaining implementation |
|---|---|---|
| Bi-fold 180 construction/geometry | WL pp57–60; WLP pp74–77; BW pp66–70; ND pp68–72 | Typed casing/no-casing basis, header/extension, baseboard thickness/buildout, bottom pivot bracket/light-block extension, track stile choices (2/2¼ rabbet/butt; Aqua 2 only). These cannot use the generic regular-frame calculation or generic regular stile choices. Without-casing and existing-casing width formulas differ. |
| Closed/Open Bypass | WLP pp93–116, especially94; other binders' bypass sections | Exact subtype/layout, side frames, Inside/Semi-Inside/Outside mounting, single/combi panel dimensions, wheel/guide choices and derived track dimensions. Aqua Open Bypass is already prohibited. WLP94 explicitly uses different formulas depending on side-frame presence and mounting; generic regular frame dimensions cannot stand in. |
| Bottom support | WLP p38; WL pp32–33; BW/ND p32 | Measured bottom gap, supporting bottom frame/sill and application-specific support. WLP expressly excludes unsupported shutters and identifies gaps above0.1 inch. Site facts must be supplied. |
| Divider and split tilt | WLP44; WL38; BW38; ND38–39 | Typed rail positions, window versus max-frame basis, exact/default location, rail size, split positions, actual louver clearance between sections. At least two louvers are required between relevant nonmotorized positions. Do not infer this from overall opening height. |
| Specialty identities/options | WLP pp126–128; ND pp133–136 | Exact YS shape identity, Continuous Arch (2¼ stile; unavailable Aqua), sunburst hub≤12, fixed Frame Include In Rail with permitted Z frame and no hinges/magnets, no hang-strip-behind for horizontal hexagon/octagon. |
| Specialty panel measurements | WLP pp127–128 | Exact net panel/leg/middle/curve dimensions and shape-specific sides/counts. YS15/YS20 range15.5–84; YS01/03/04/02/06 one panel. Imperfect YS02/06 needs middle height even when width equals height. |
| Specialty divider decision | WLP44/128; ND38/136 | YS10/51/68/69 use the lower horizontal-louver leg height, not order height. Sunburst-only panels cannot have a divider. |
| Narrow single/mixed regular panels | WL12 and corresponding construction sections | Exact per-panel widths and hang-strip placement, rather than the current widest-panel summary. Keep current narrow/mixed compatibility holds until this is represented. |

The WLP pages listed above were reread from the actual PDF during this increment. The all-program cross-reference expands the prior `outputs/onyx-audit-20260920/norman-shutter-readonly-gap-review.md`; program-specific new implementation still requires its full source to be checked rather than mechanically applying WLP rules to other programs.

## Evidence genuinely still needed

1. Current 805-applicable dealer shutter rates and full surcharge/freight/oversize/processing schedule; confirmation that R00743/RA00743 is the purchasing account applicable to805. Full binders' blank base-rate fields do not resolve imported provisional rates or dealer comparisons.
2. WLP p127 internally conflicts on the exact8⅛-inch hinge-leg boundary (“cannot be less” versus “greater than”). Keep exact equality unresolved. The guide also calls eyebrow/half-round limits approximate and dependent on shape/frame/stile, so the reference chart cannot certify an order.
3. Factory acceptance of required specialty templates and configurations beyond the guide's exact rules. Valid numeric dimensions alone are not template approval.

## Validation and pending proof

Focused tests cover every documented program/layout at6-inch and maximum widths and ±1/16-inch failures, mixed-stack asymmetry, panel count/identity, mount/surface confirmation, Aqua louver rejection, malformed records, unchanged historical parsing, actual server-adapter round trip and UI rendering. Existing specialized geometry holds remain asserted. Parent full release typecheck/tests/build and live save/reopen proof are required before this increment is described as verified live.

## Follow-up: Bi-fold 180 construction inputs

The next increment implements casing/no-casing reference dimensions, header3/3½, fascia, optional0–2-inch header extension, measured baseboard thickness and header buildout, bottom pivot L-bracket choice and its required1¾-inch light-block extension. Aqua fascia is plain-only (WLP77). Casing width adds1¼; **existing-casing height is explicitly a directly measured MFF height**, because the casing diagram supplies no numeric height adjustment. No-casing window dimensions add3½width/4½height. These displayed source dimensions do not replace the pricing-size calculation or authorize a price.

The guide's thick-baseboard3-inch-header/buildout recommendation is presented as advice (thickness minus⅛), preserving its wording as a suggestion rather than inventing an absolute compatibility rule. Header/casing fields use the existing save queue and nested versioned construction record. Changing casing basis explicitly clears the two reference measurements so values are not reinterpreted silently.

Bi-fold180 now exposes its proper2/2¼-inch Butt/Rabbet choices (Aqua2-inch only). The UI omits regular-frame basis/type/sides, widest-panel summary and closure controls for this exact application; server regular-assortment validation delegates those fields to the dedicated track schedule. Other applications and historical records keep the existing regular behavior. A new schedule does not remove specialized geometry or account-pricing holds. Still remaining: full hardware quantity/length schedule, detailed site clearance acceptance, exact source pricing-size routing and all bypass/specialty branches listed above.

## Follow-up: per-panel bottom support

Regular, French-door and double-hung panels now retain individual bottom-frame/existing-sill/none choices, actual measured gap and explicit frequent-open use in a versioned site record. This does not infer support from the frame menu. WL33, WLP38 and BW/ND32 identify no support, gap over0.1 inch, and frequent-open use as unsupported conditions. The server checks the exact0.1-inch endpoint (no rounding to⅛), rejects negative gaps and requires complete site facts. Frequent-open use is a source-backed operational warning, not an unconditional ordering ban; the physical no-support/gap constraints remain hard requirements. Track and specialty support remain in their independent geometry holds rather than forcing a generic sill model on them. Historical records still parse; prior-date validations are preserved. The mobile integration fixture now supplies both actual support records while retaining the unresolved-price assertion.

## Follow-up: divider schedules

Each panel with a divider now accepts a versioned schedule of rail sizes, explicit window-bottom/frame-bottom datum, actual reference height, default panel-center versus specified measured centers, exact-location elections, split-tilt centers and actual clear-louver counts between consecutive locations. The UI uses3-inch standard sizes for composite programs, and3⅛–7⅞-inch custom sizes in⅛increments for Brightwood/Normandy. Custom sizes retain a distinct unverified-account-surcharge issue. Guide location tolerances are shown from the selected louver size.

The server requires specified centers within the actual stated reference height, rejects duplicate rail/split locations, requires at least two actual louvers in every nonmotorized interval, and rejects default-center ambiguity when there are multiple boundaries. Adding split locations saves the existing Split Tilt selection asYes; a contradictory saved flag is rejected. Changing the measurement datum clears old reference/position values instead of reinterpreting them. No window-to-panel origin or louver counts are guessed. Existing final divider-geometry hold remains because top/bottom rail geometry, shape-specific sections and factory louver layout are not fully modeled. Split-tilt-only panels without divider presence remain a separate unfinished path.

Primary sources reread: WL38, WLP44, BW32/38, ND32/38–39. Tests cover all six standard programs, all39custom rail sizes for each wood program, size and position endpoints, missing datum/exact election, duplicate centers, louver-clearance cardinality, persisted server-adapter round trip and historical date behavior.36 focused tests passed across divider/support/panel/Bi-fold/mobile integration. Local typecheck had no errors in changed files; full release remains parent-owned because this clone's shared node_modules lacks several unrelated dependencies.

## 2020 Bypass follow-up

Added a versioned bypass record for two independent panels, side-open arrangement, exact mount, left/right side-frame presence, measured window dimensions, optional Open Bypass front-panel overlap choice and interlocking bottom guide. Closed Bypass requires the standard guide; Open Bypass requires an explicit choice and remains unavailable for AquaShield. The panel widths are now separate finished measurements.

The original PDF tables were visually checked: Woodlore p78 is **24 / 30 / 36 inches** for 1⅞ / 2½ / 3–4½-inch louvers. Woodlore Plus p94 is 24 / 36; AquaShield is **31 inches for 2½ and 3**, 36 for 3½ and 4½ (1⅞ struck out in the actual table). Brightwood p91 and Normandy p93 are **30 / 36 / 42 inches** for 1⅞ / 2½–3 / 3½–4½.

Source max-frame reference formulas preserve the actual mount and left/right side frames. The Norman server adapter previously collapsed Semi-Inside Mount into Inside; the bypass record now retains and validates the distinct semi-inside setting. Outside widths with fewer than two side frames remain explicitly unresolved; the guide only gives the +3-inch formula when both side frames are present. These reference calculations do not silently replace pricing dimensions.

Still unresolved: combi-joined groups, center-open and additional-track arrangements, exact track/hardware/overlap geometry, stile construction, all surcharges and account rates. The general application-geometry and account-price holds remain. This increment does not certify bypass pricing or make held shutters sendable.

## Split-tilt semantics and divider-independent entry

Re-read WL/BW/ND pp35–37 and WLP pp41–43. A custom split-tilt location is measured to the **top of the closed louver**, unlike a divider rail measured to its center. Equal split is by louver count (odd totals give the bottom section one extra), never half of an opening height. The UI now captures equal/custom mode, top-of-closed-louver confirmation and a separate exact-location/allow-deviations election. Panels without divider rails can retain split-only schedules; no phantom divider is inserted. A panel-bottom datum is offered only for split-only measurements when there is no bottom frame, sill or sill cap.

Older center-labelled arrays are preserved unchanged but require explicit source-reference confirmation before current validation accepts their meaning. Final top/bottom rail sizes and actual louver sections remain held for manufacturer verification; the binders describe a dealer-portal calculation/acceptance step, not a complete closed-form formula. The one-louver-section restriction still needs explicit upper/lower section count capture; it is not proved by the existing between-location clear-louver counts.

## Actual louver sections follow-up

Added explicit actual louver counts for every divider/split section, including the outer bottom/top sections. WL/BW/ND37 and WLP43 prohibit divider rails and split tilt when any relevant section has only one louver. Counts must be integers of at least two, with exact section cardinality; equal split on an undivided panel requires equal counts or one extra bottom louver. The actual geometry hold remains, and no count is inferred from opening or panel height. Existing records without the additive field remain readable; historical-date validation is unchanged.

## Finite remaining implementation ledger after these increments

These are **implementation gaps supported by the pinned guides**, not missing dealer-rate evidence. A row can be broken into smaller release increments, but must remain open until its stated exit evidence exists. Prices remain separately held.

| Open branch | Concrete data/rule still to implement | Source and exit evidence |
|---|---|---|
| Bi-fold 180 completion | Full hardware quantity/length schedule, site clearance, pricing dimension basis | WL57–60/WLP74–77/BW66–70/ND68–72; exact schedule plus negative boundaries and saved record; current reference frame calculation alone is insufficient |
| Other Bi-fold | Distinguish 90-degree and other track layouts; program-specific panel stack/count/width/height/mount rules | Respective binder Bi-fold Track sections preceding Bi-fold180; read full program-specific tables/diagrams before coding |
| Bypass completion | Combi-joined, center-opening and additional-track layouts, front/back order for all groups, stile construction, overlap/carrier/guide schedule | WL77–99/WLP93–116/BW90 onward/ND92 onward; exact group members and hardware must persist. Two-independent-panel side-open branch is implemented |
| Divider/tilt final geometry | Top/bottom rail dimensions and dealer-returned acceptance; exact custom split requested vs final accepted position; motorized section rules | WL/BW/ND35–38, WLP41–44; actual final rail/louver schedule, not approximate panel-height chart. One-louver check for whole undivided or Double-Hung panels remains distinct from implemented divider/split section counts |
| Double Hung / wide Woodlore | Typed upper/lower panel groups and horizontal T-post; exact per-panel support and allowed width/stile combination | WL32–33/WLP38/BW32/ND32 and Double Hung sections; no inferred T-post from a generic frame string |
| Regular narrow/mixed panels | Individual finished widths and hang-strip placement; source route for widths below9 inches | WL12 and corresponding program construction sections; replace current widest-panel-only evidence with each actual panel |
| Specialty identity and frame rules | Exact YS identities; sunburst vs horizontal vs combined; continuous arch; Frame Include In Rail; exact eligible frames, no-hinge/magnet state and hang-strip exclusions | WLP126–128/ND133–136; program-specific typed choices and exact server compatibility |
| Specialty measurements | Net widths/heights/legs/middle heights/curves, exact shape-specific count/dimension limits, lower horizontal leg as divider datum | WLP127–128/ND133–136; each shape's actual measurements, including imperfect quarter rounds, survive save/reopen; template-required paths remain held |

**External evidence is a separate finite set:** current 805-applicable six-program dealer base rates and every surcharge/freight/oversize/processing treatment; confirmation of applicable purchasing account; resolution of the exact8⅛-inch specialty hinge-leg contradiction; factory acceptance for mandatory templates and geometry explicitly described as approximate. Nothing in the above implementation backlog is represented as resolved merely because an account price remains blocked. Representative0353 proof does not certify other configurations or all six programs.

## Specialty identity/frame increment

Read the complete specialty identity pages in WLP124–138, BW123–136 and ND133–146, including visual checks of WLP130 and133. Added46 exact YS identities for Woodlore Plus, Brightwood and both Normandy finishes; AquaShield excludes YS56 and the Continuous Arch variants of YS05/65/66. The Woodlore binder has no specialty section: its same-program specialty route remains an explicit source exception rather than inheriting another program's authority.

The additive saved record now contains exact shape, Standard/Continuous Arch, frame identity/sides, Frame Include In Rail, explicit hinges/magnets/hang-strip placement, largest actual sunburst hub and continuous-arch stile width. The dedicated UI filters the five Frame-In-Rail Z frames for each program (Aqua substitutes Deep Bullnose for Beaded), omits incompatible fixed-panel hardware choices, and synchronizes the existing frame identity on save. Server checks all twelve Frame-In-Rail shape identities; fixed no-hinge/no-magnet construction; horizontal hexagon/octagon hang-strip exclusion;12-inch maximum hub;2¼-inch continuous-arch stile;one-panel sunburst identities;four/all-around sides;no sunburst-only divider;and actual Circle/Oval Sunburst net sizes15½–84. Net panel sizes are stored independently from openings.

Regular rectangular finished-height/divider thresholds no longer pretend to certify specialty geometry. The exact specialty geometry/template/account holds remain for every shape, including otherwise-valid records. Remaining specialty work is net leg/middle/curve and T-post geometry, template acceptance, source-specific frame insert/solid construction, special hardware/tilt compatibility and order charges. Approximate arch charts and the8⅛-inch hinge-boundary contradiction remain unresolved as previously listed. This is an assortment/frame increment, not comprehensive specialty order certification.

Validation:95 targeted tests across specialty, panels, assortment, Bi-fold, bypass, dividers and native DesignCard pass. Tests enumerate all46 identities, all300 permitted program/Frame-In-Rail-shape/frame combinations, exact hub and circle/oval boundaries, continuous-arch/Aqua exclusions, malformed data, old history and actual server-adapter persistence. Local changed-file typecheck is clean; full release and production save/reopen remain parent-owned/pending.

## Specialty order-outline and template increment

Reread WLP128/136–139, BW126/134–137 and ND136/144–147. Added a separate optional version-1 order-outline record under each specialty, retaining older identity records unchanged. Order width/height are explicit and independent from opening and finished-panel measurements. Perfect/imperfect classification and existing-molding use are declared; missing geometry is not silently treated as a perfect arch.

Exact rules now cover YS57/58/68/69 strict middle-height inequality for perfect arches; YS05/10/51 inclusive left/right-leg minimum; YS02/06 imperfect-quarter middle-height requirement even at equal width/height; YS56 maximum six-inch curve above the leg; YS65/66/67 at least two vertical T-posts with no fabricated outer positions, required middle location for three, and all requested positions for more than three; and YS62 explicit centered versus measured WA. The source says two-post outer positions are unnecessary, not forbidden: saved optional pairs remain valid and subject to factory outline determination.

Inside mount, imperfect arches, existing molding and oval shapes require a recorded template submission reference. The reference is only an evidence identifier; it does not establish template receipt or acceptance. The UI states that templates older than one year must be resent. No receipt date, age or factory approval is invented. Every specialty retains the final geometry/account hold. Existing shape records, old date validation, quote IDs and price snapshots are unchanged.

Validation: 27 focused tests passed, including all explicit shape branches and exact boundaries, malformed/historical records, persisted nested geometry, current server validation and mandatory final holds. Local changed-file typecheck is clean; this clone still lacks unrelated PGlite/PDF packages, so parent owns full release checks. Production outline/template save/reopen proof remains pending deployment.

### Remaining finite specialty implementation tasks

1. Frame insert/solid construction and source-specific tilt/hinge/louver hardware compatibility; current frame identities do not fully represent manufacturing style.
2. Lower horizontal-louver divider decision for YS10/51/68/69 using the correct leg height, with corresponding actual per-section louver/rail layout.
3. Remaining per-shape net/leg/middle geometry and exact multi-panel/T-post membership beyond the explicit formulas above, including French-door cutout linkage.
4. Document actual submitted-template identity and factory-returned acceptance/approved outline without using a user-entered reference as approval.

The eight-branch ledger above otherwise remains open: Bi-fold180 hardware/clearance/pricing-size routing, other Bi-fold, complete bypass groups/hardware/stiles, final divider/motor layout, Double Hung/wide Woodlore, regular narrow/mixed panels, and the remaining specialty construction/geometry tasks. External rate/account evidence, approximate-chart factory verification and the conflicting8⅛-inch hinge boundary remain distinct exceptions. No whole-family completion claim follows from these bounded implementations.

## Specialty horizontal-section divider increment

WLP44, BW38 and ND38 expressly require a divider when the lower horizontal-louver section exceeds78 inches (AquaShield72), for YS10/51/68/69. Added an individual panel field for that actual lower-section height/leg reference; it is not inferred from opening, order outline or full panel height. Missing section height blocks this rule's verification; the exact endpoint does not require a divider, while1/16inch beyond does. A recorded divider still requires its existing rail position/louver schedule and final geometry verification.

All20 program/shape combinations are tested at the applicable exact threshold and1/16above; tests also prove a taller full panel does not substitute for the lower section, older records remain parseable, malformed fields fail, and historical-date behavior remains unchanged.30 focused tests pass. This closes the basic lower-section divider-presence task from the finite specialty list; final section rail/louver geometry remains open. Production save/reopen proof is pending deployment.

## Specialty frame manufacturing increment

WLP124–125, BW123 and ND133 specify solid versus insert construction. The saved specialty record now retains explicit manufacturing style and, for YS05, whether its louvered arch has an eyebrow curve. The UI offers only the exact source result; server validation rejects a different saved style. Non-Aqua circle/oval frames are solid; listed polygon shapes use inserts; named curved sunburst/arch deco frames are solid and Vintage frames have solid curved tops with insert straight sides. Sunburst-with-divider-strip has its separate curved/straight assignment. The eyebrow Mission Deco exception is captured rather than treating every arch/deco pair the same.

AquaShield uses its independent table: Camber Deco is always solid; only the listed Vintage/Deep Bullnose/Deep Plain frame routes receive the other solid/insert assignments. Unlisted combinations remain explicitly unresolved, including new Mansard shapes and curved Z-frame cases not specified in the table. No construction is transferred from non-Aqua to Aqua by analogy. Exact geometry, hardware and pricing holds remain.

35 focused tests pass, enumerating named shape groups across the four hardwood programs, Aqua exclusions, Mission eyebrow choice, malformed/old records and current server persistence/holds. Changed-file typecheck is clean with the same unrelated dependency limitations. Full release and production proof remain pending. This closes only the listed manufacturing assignments; incomplete shape/frame table coverage and special tilt/hinge hardware remain in the finite ledger.

## Live-found inactive hinge finish refinement

0353D exposed the generic hinge-color control even when the exact specialty record explicitly specified no hinges. Current typed no-hinge specialties now omit that control and skip irrelevant hinge-finish compatibility checks. Existing hinge metadata is retained unchanged for history; hinged, undeclared and historical-date configurations retain the prior checks.54 focused UI/server tests pass. This does not certify special hinge installation geometry or change any price hold.
