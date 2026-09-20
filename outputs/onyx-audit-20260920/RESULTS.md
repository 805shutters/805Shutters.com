# Onyx current catalog audit — 2026-09-20

Status: supported shutter selection fixes deployed by parent in release c3ebaf4420ed9d857f50646970de6f17835d7541. Live verification exposed an additional Onyx configuration-routing defect, fixed and tested in 8f357313; deployed in9c53f89213bda098716eec2b5f6a15822b0f7c62 and verified live below. Complete Onyx assortment/pricing certification remains open.

Authenticated source: Onyx dealer portal, account CHE01, California Home Exterior / Mike Shepard. Observation date 2026-09-20; effective date is not published on the forms. The current account identity is confirmed, but account-specific cost must not replace 805 selling-price policy.

## Implemented and verified status

Commits `3a7d17c9` and `338e4ad5` preserve existing catalog identities and historical prices. They add account-scoped current assortment evidence; material-specific picker choices; and matching server validation for color, frame, louver, tilt, and US-made hinge restrictions. Painted/stained Bassia are separately enforced. Binder frame names require an unambiguous current frame mapping. Unknown and generic hidden tilt selections remain held until an exact source code is provided. Existing construction/pricing holds are preserved.

The original shutter fixes are verified live in internal quote805-0333. All eight held catalog destinations and application/hinge repairs are deployed and representative selections are verified live in0333; details are recorded below. All automatic pricing evidence gaps remain open.

## Current shutter ledger

Every row is sourced to https://admin.onyxshutters.com/OrderDetail.aspx and the pinned `src/lib/quote/onyx-portal-20260920.json`. These menus establish visible assortment, not all conditional construction compatibility.

| Portal material | Existing CRM program destinations | Colors | Frames | Louvers | Tilt | Exact unresolved exception |
|---|---|---:|---:|---|---|---|
| Bassia | painted_basswood, stained_basswood | 15 paint + 16 stain | 23 | 2.5, 3.5, 4.5, 5.5 | C, H1, H2, H3, O | 5.5 construction/price rules; specialty cross-product conditions; custom finish charges |
| Sycamore | secamore | 15 | 23 | 2.5, 3.5, 4.5 | C, H1, H2, H3, O | Dealer rate conflict; exact specialty and charge coverage |
| Vinyl | vinyl | 15 | 14 | 2.5, 3.5, 4.5 | C, H2, H3, O | Dealer rate conflict; exact specialty and charge coverage |
| VLO | vlo_hybrid | 13 | 23 wood frames | 2.5, 3.5, 4.5 | C, H2, H3, O | Dealer rate conflict; exact specialty and charge coverage |
| Ash | onyx_ash_shutters / onyx_ash (deployed; held selection verified) | 31 | 23 | 2.5, 3.5, 4.5 | C, H1, H2, H3, O | Complete restrictions/charges unresolved; distinct destination, not Poly Composite |
| US Made Vinyl | onyx_us_made_vinyl | 2 | 5 | 3.5 only | H2 only | Dealer rate conflict; French-door rules, sill-plate side codes and charges |
| Poly Composite (legacy CRM) | poly_composite | Unverified | Unverified | Unverified | Unverified | Not present as a material in current dealer ordering menu; no discontinuation evidence, preserve historical identity |

Current imported hinges are White, Cream, Antique Brass, Bright Brass, Nickle and Black (Paint to Match disabled). The application/hinge follow-up implements these choices in the UI and server, deployed and verified live. Frame-side variants, shape-specific options, raised/flat panels, flush rails, hinge dependencies and all size limits still require reconciliation.

## Account price comparisons

All six fixtures: width30 × height60 inches, Window Size, Regular, four-sided L Outside (VL Outside for Vinyl / US-made), 3.5-inch louver, 101_White, panel L, quantity1. Billable frame area = round((30+3.5)×(60+3.5)/144, 3) = 14.773 square feet. The portal rounds this area; truncation would give14.772 and does not match these fixtures.

| Material | Portal dealer rate inferred from fixture | Portal line before tax | Current catalog rate reviewed | Result |
|---|---:|---:|---:|---|
| Bassia | 13.50/sqft | 199.436 | 13.50 | Fixture agrees; no universal pricing approval |
| Sycamore | 10.95/sqft | 161.764 | 11.95 | Conflict, unchanged |
| Vinyl | 12.00/sqft | 177.276 | 11.00 | Conflict, unchanged |
| VLO | 12.00/sqft | 177.276 | 10.35 | Conflict, unchanged |
| Ash | 22.00/sqft | 325.006 | Held destination, no rate imported | Rate evidence limited to fixture |
| US Made Vinyl | 13.65/sqft | 201.651 | 13.60 | Conflict, unchanged |

No dealer factor, customer markup, shipping, tax or selling-price policy was changed. A sample rate does not establish a full surcharge schedule or effective date.

## Shade assortment reconciliation

The current order-program menu has Onyx Signature, Onyx Lux and Woven. The initial audit found no CRM destinations; eight distinct held destinations are now implemented, now deployed with representative family save/reopen proof. Exact Signature menu inventory is in `signature-assortment.json`: **33 fabric groups and293 color identities** (Roller20/185, Sunscreen3/33, Zebra10/75). Each row has source, observation date, effective-date unknown, exact color IDs/names and the exception `missing_catalog_and_grids`. Their implemented destinations preserve exact source identities; pricing remains held.

Signature visible options include IM/OM (IM factory width deduction1/8 inch), continuous cord/cordless/motorization, product-specific cassettes, cassette colors/wrap, cord color/position, bottom rail/color/wrap, same-order side-by-side alignment conditions and custom cord-length surcharge $10. Roller and Zebra cassette/bottom-rail menus differ. Motor variants, combinations, grids, dimensions, freight and effective schedule remain unverified. Lux and Woven enumeration is complete below.

## Draft preservation / next live proof

Unsubmitted comparison drafts preserved:123320 / AUDIT0920ONYX (five imported shutter lines);123321 / AUDIT0920US (one US-made line);123322 / AUDIT0920SIGN (three shade price fixtures);123323 / AUDIT0920LUX (three fixtures);123324 / AUDIT0920WOVEN (two fixtures). Side mark INTERNAL AUDIT DO NOT ORDER. No checkout, order placement, warranty acceptance or payment performed.

The original live CRM proof below confirms: US-made only Pure White/White, 3.5-inch louvers, H2, White hinges and five current frames; VLO current wood frames and no Butter/Gray/H1; Bassia painted/stained separation and exact codes; invalid saved/server configurations blocked; save/reopen representative quotes preserves selection and customer output. The new shade/Ash destinations and application/hinge follow-up have passed the live save/reopen checks below. Complete grids and compatibility remain unresolved.

## Completed Lux / Woven assortment enumeration

`lux-assortment.json` captures every visible Lux product/pattern/color entry: Fabric Blinds4 groups/108 colors, Honeycomb6/144, Sheerview6/65, total16/317. `woven-assortment.json` captures Walden Premier36 and Walden Select57 colors, total2/93. Signature + Lux + Woven total **51 groups and703 exact color identities**, each mapped to an implemented held CRM destination, with representative family save/reopen verified. Source anomalies such as `FB_PG2_50446` appearing under FB_PG1, `HC_PG01_65100D` under FB_PG4, and repeat color names with different codes are deliberately preserved, not silently normalized.

Lux honeycomb offers cordless, continuous cord, TDBU cordless and motorization; tile cut displays $7 per blind. Fabric blinds offer cordless/motor, Dover/Westminister/no valance, return options and cloth tapes. Sheerview offers continuous cord/cordless/motor, curved/flat valance, cord/metal/plastic chain and $10 custom cord-length surcharge. These are menu observations; dependent motor/size/assembly prices still need grids.

Woven shows IM deduction3/8 inch and six liner choices per collection. Premier has four edge bindings; Select has twelve, with distinct liner/binding codes. Both offer continuous cord/cordless/TDBU($150)/wand motor($200)/remote motor($250), single/2-on-1/3-on-1 and maximum custom valance120 inches. Charges are dealer-form labels and do not establish 805 selling prices. Lux audit draft123323/AUDIT0920LUX contains three baseline fixtures; Woven draft123324/AUDIT0920WOVEN contains two. All remain unsubmitted.

Authenticated Forms was rechecked: https://admin.onyxshutters.com/Forms.aspx exposes only shutter order sheet, shade order sheet, check-by-fax and2020 Reference Manual. No current Signature/Lux/Woven/Ash price-grid download is linked. A focused official-domain search also found no current shade price guide. The official indoor page https://www.onyxshutters.com/shades corroborates the six indoor product types. https://www.onyxshutters.com/outdoor-shades documents a current outdoor-shade offering, absent from the authenticated five-program order menu and CRM; exact series, fabrics, controls, dimensions, pricing and ordering route remain an additional unresolved exception.


## Per-color mapping ledger and shade cost fixtures

`shade-mapping-ledger.csv` records all703 color identities individually, with exact source pattern/color IDs, unknown effective date, implemented product destinations, unresolved price grids/compatibility and explicit implementation status. These runtime IDs are implemented; representative family selections are verified live; the complete per-color identities are exhaustively adapter-tested. Automatic pricing remains held.

`shade-cost-fixtures.json` preserves eight 30×60 IM, quantity-one account CHE01 comparisons. These are dealer costs, not suggested retail or 805 selling prices:

| Draft | Offering and control | Base | Separate surcharge | Before tax |
|---|---|---:|---:|---:|
| 123322 | Roller Amelia BO White, cord, square cassette | 53.70 | 24.26 | 77.96 |
| 123322 | Sunscreen 1% SC-1 Ice White, cord, square cassette | 58.29 | 24.26 | 82.55 |
| 123322 | Zebra Arcadia BO Cloud Meadow, cord, square cassette | 90.63 | 11.97 | 102.60 |
| 123323 | Fabric Blinds 2-inch LF Slate, cordless, Dover | 165.20 | 0.00 | 165.20 |
| 123323 | Honeycomb 3/4 Single LF Roswell, cordless, no valance | 164.00 | 0.00 | 164.00 |
| 123323 | Sheerview 2-inch LF Bright White, cord, curved valance | 165.20 | 0.00 | 165.20 |
| 123324 | Walden Premier Artisan Weave, cordless | 189.50 | 0.00 | 189.50 |
| 123324 | Walden Select Alisia Antique White, cordless | 235.50 | 0.00 | 235.50 |

Signature's displayed line price excludes its separate surcharge. The combined draft subtotal is202.62 plus60.49 surcharge; tax25.65; grand288.76. Lux subtotal494.40, tax48.20, grand542.60. Woven subtotal425.00, tax41.44, grand466.44. These samples cannot replace full grids, size boundaries, motorization/accessory charges, freight or effective schedules.

## Production verification draft

Internal customer `Onyx Catalog Verification 2026-09-20`, quote **805-0333**, retains the internal do-not-send/order note and four saved/reopened shutter selection fixtures described below. The initial exact-program routing failure was repaired by8f357313 and verified after deployment. Pricing remains incomplete and customer sends disabled.


## Live shutter selection proof and new held destinations

Production release9c53f89213bda098716eec2b5f6a15822b0f7c62 was verified in the actual CRM. Quote805-0333 was closed, located in the Quotes list as Draft/Pricing incomplete, and reopened. All four30×60 line selections persisted:

- US-made: Regular, Window Size, OM, VL Outside, four sides,3.5-inch louver,101_White, White hinge, panelL, H2 and one hidden-tilt section. Remaining panel/section dimensions were intentionally not invented.
- VLO/MDF Hybrid: Regular, Window Size, OM, L Outside, four sides,3.5-inch louver,101_White, White hinge, panelL and front-center tilt.
- Painted Bassia:150_Onyx Black with5.5-inch louver. This is a color/louver persistence fixture, not a complete construction.
- Stained Bassia:215_Java. This is a stain-program persistence fixture, not a complete construction.

Current menus were verified: US-made has two colors, five frames,3.5-only louver, H2-only tilt and White-only hinge. VLO has23 wood frames,13 colors excluding Butter/Gray and noH1. Bassia paint/stain menus contain15/16 distinct colors. All four price holds persisted; total unavailable; Send Quote and Send Payment Link disabled. No customer output was sent and no quote was marked sold/sent. Remaining generic shape and non-US hinge mismatches are explicit open exceptions.

Deployed implementation (representative selection/save/reopen verified) adds **eight separate catalog destinations,52 programs and734 source color entries**: `onyx_signature_roller`, `onyx_signature_sunscreen`, `onyx_signature_zebra`, `onyx_lux_fabric_blinds`, `onyx_lux_honeycomb`, `onyx_lux_sheerview`, `onyx_woven`, `onyx_ash_shutters`. The shade ledger's current destination column now names implemented IDs; its implementation-status column distinguishes exhaustive identity tests from representative live family proof. Earlier missing-destination findings above describe the audited starting state.

Each current source pattern has its own program with an empty, explicitly manual-required grid. The dedicated Onyx controls save exact collection/color IDs and observed mount/control or Ash frame/shape/louver/tilt choices. Both server and picker enforce product/collection/color identity. Menus are not universal compatibility certification; missing grid, dimensional and conditional evidence keeps all new destinations blocked for customer pricing/delivery. Existing shutter IDs, provisional rates and selling policy remain unchanged. Source evidence is pinned separately as `onyx-shade-assortment-2026-09-20`; the effective date remains unpublished. Outdoor shade series/fabrics/ordering remain unresolved and are not represented by invented choices.

Validation for the held destinations:54 focused catalog/source/adapter/builder tests passed; an earlier62-test focused run covered the new exhaustive selection test plus existing Onyx pricing and42 DesignCard routing checks. TypeScript and whitespace checks passed. The734-row round-trip check exercises saved JSON and the actual server adapter; the production save/reopen proof is recorded below.

## Follow-up application and hinge repair

The existing shutter picker now uses each material's exact current application menu (US-made Regular/French Door only; imported products keep their observed Cafe/ByPass-Close/ByPass-Open/Bi-Fold Tracking/specialty distinctions). The server validates the same material-specific choices; historical generic ByPass remains unresolved rather than silently choosing open or closed. Construction and pricing rules still independently apply.

On September 20 all five saved imported comparison lines were reopened read-only, confirming identical enabled hinges: White, Cream, Antique Brass, Bright Brass, Nickle and Black. Paint to Match is explicitly disabled. These observations are pinned in a separate immutable hinge addendum. UI and server now use those choices for imported shutters/Ash; legacy unambiguous Anti Brass/Bri Brass/Nickel aliases remain recognized, while Match/ORB/unknown choices are held. US-made remains White only. No saved portal line or dealer/selling rate was changed. This increment is now deployed and its live proof is recorded below.

Latest application/hinge validation:97 targeted tests and TypeScript passed. The source identity remains immutable: the hinge observations use a new addendum rather than altering the prior shutter snapshot.

## Final production selection proof for every new family

On releasebc4bea39, one30×60 internal fixture was added for each of the eight new families, making12 total lines in quote805-0333. The builder was closed, the quote located as Draft/Pricing incomplete in the Quotes list, and reopened. All exact collection/color IDs persisted. `held-destinations-live-proof.json` records the exact selections: Signature Roller Amelia White, Sunscreen1% Ice White, Zebra Arcadia Cloud Meadow, Lux Fabric Blinds Slate, Lux Honeycomb3/4 LF Roswell, Lux Sheerview2-inch LF Bright White, Woven Premier Artisan Weave and distinct Ash Java.

Release d28bd77d was subsequently loaded by a full page refresh. All eight family selections persisted. The U.S.-made expanded application menu contained only Regular/French Door; the imported hinge dropdown contained the six observed enabled choices. Ash Black hinge was selected and the quote closed/reopened again: Black, Java215, L Outside, Regular,3.5 and C all persisted.

The quote retained12 pricing holds, an unavailable total, and disabled Send Quote/Send Payment Link actions. No manual price was entered; no customer output was sent or status marked sent/sold. These are selection/persistence fixtures, not complete orderable configurations or full pricing certification. The ledger explicitly separates the734 exhaustively adapter-tested color identities from one live saved fixture per new family.

## Woven accessory follow-up

A separate current menu audit covered Premier and Select under all five controls (Continuous Cord, Cordless, TDBU, Wand Motor and Remote Motor). The six liners differ by collection: Premier includes Chocolate blackout/privacy; Select instead lists Privacy Black, Privacy Gary and Privacy SoftWhite. Premier has four bindings; Select has twelve. These exact identities and the displayed120-inch custom valance maximum are pinned in `onyx-woven-options-20260920.json`. Unknown color/size/assembly compatibility and accessory charges remain held.

The new Woven UI/server increment adds exact collection-specific liner/binding and single/2-on-1/3-on-1 selections, clears accessories when collection changes, and enforces the custom valance width boundary. Multiple-shade assemblies remain draft-only pending dimensions/model/price evidence. This increment awaits deployment and live proof. No source label surcharge was converted into an805selling price.

Portal navigation finding: edit forms depend on the active order-program session. Enter each preserved draft header before opening its line URLs. Rapid pattern postbacks can temporarily show the new pattern label with old dependent menus; mismatched captures were discarded and controls re-read after the correct collection menus appeared. No comparison draft was updated or submitted.

### Exact frame-side construction follow-up

The six preserved Regular 30 × 60 dealer draft lines were re-opened in the correct imported/US-made order contexts. Bassia, Sycamore, Vinyl, VLO and Ash list eight constructions: four sides, three sides, directional bottom/top/right/left sill plates, three sides with floor clearance, and two sides. US-made Vinyl lists only four sides and the four directional sill-plate constructions. This is menu evidence, not proof of every frame/application/size combination or its charge.

The source snapshot `src/lib/quote/onyx-frame-sides-20260920.json` is independently hashed and pinned. CRM choices now follow these material-specific menus. Exact special construction codes survive the adapter; they are never collapsed into ordinary three-sided pricing. Server validation rejects unsupported material choices and retains an explicit allowance/charge hold for special constructions. Ash continues to carry its entire missing-grid hold. Historical snapshots before the observation date remain unchanged. This increment is implemented and tested; production save/reopen proof follows parent deployment.
