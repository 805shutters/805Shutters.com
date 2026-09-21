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
