# Onyx current catalog audit — 2026-09-20

Status: supported shutter selection fixes deployed by parent in release c3ebaf4420ed9d857f50646970de6f17835d7541. Live verification exposed an additional Onyx configuration-routing defect, fixed and tested in 8f357313; deployed in9c53f89213bda098716eec2b5f6a15822b0f7c62 and verified live below. Complete Onyx assortment/pricing certification remains open.

Authenticated source: Onyx dealer portal, account CHE01, California Home Exterior / Mike Shepard. Observation date 2026-09-20; effective date is not published on the forms. The current account identity is confirmed, but account-specific cost must not replace 805 selling-price policy.

## Delivered increment

Commits `3a7d17c9` and `338e4ad5` preserve existing catalog identities and historical prices. They add account-scoped current assortment evidence; material-specific picker choices; and matching server validation for color, frame, louver, tilt, and US-made hinge restrictions. Painted/stained Bassia are separately enforced. Binder frame names require an unambiguous current frame mapping. Unknown and generic hidden tilt selections remain held until an exact source code is provided. Existing construction/pricing holds are preserved.

Validation: 115 initial focused tests passed; 66 focused follow-up tests passed; TypeScript checks clean. These are local tests, not production save/reopen proof.

## Current shutter ledger

Every row is sourced to https://admin.onyxshutters.com/OrderDetail.aspx and the pinned `src/lib/quote/onyx-portal-20260920.json`. These menus establish visible assortment, not all conditional construction compatibility.

| Portal material | Existing CRM program destinations | Colors | Frames | Louvers | Tilt | Exact unresolved exception |
|---|---|---:|---:|---|---|---|
| Bassia | painted_basswood, stained_basswood | 15 paint + 16 stain | 23 | 2.5, 3.5, 4.5, 5.5 | C, H1, H2, H3, O | 5.5 construction/price rules; specialty cross-product conditions; custom finish charges |
| Sycamore | secamore | 15 | 23 | 2.5, 3.5, 4.5 | C, H1, H2, H3, O | Dealer rate conflict; exact specialty and charge coverage |
| Vinyl | vinyl | 15 | 14 | 2.5, 3.5, 4.5 | C, H2, H3, O | Dealer rate conflict; exact specialty and charge coverage |
| VLO | vlo_hybrid | 13 | 23 wood frames | 2.5, 3.5, 4.5 | C, H2, H3, O | Dealer rate conflict; exact specialty and charge coverage |
| Ash | NONE | 31 | 23 | 2.5, 3.5, 4.5 | C, H1, H2, H3, O | Missing product/program destination and complete restrictions/charges; do not alias Poly Composite |
| US Made Vinyl | onyx_us_made_vinyl | 2 | 5 | 3.5 only | H2 only | Dealer rate conflict; French-door rules, sill-plate side codes and charges |
| Poly Composite (legacy CRM) | poly_composite | Unverified | Unverified | Unverified | Unverified | Not present as a material in current dealer ordering menu; no discontinuation evidence, preserve historical identity |

Generic current hinge menu also differs from the legacy picker: White, Cream, Antique Brass, Bright Brass, Nickle, Black (Paint to Match disabled). Only the unequivocal US-made White-only constraint is repaired in this increment. Frame-side variants, shape-specific options, raised/flat panels, flush rails, hinge dependencies and all size limits still require reconciliation.

## Account price comparisons

All six fixtures: width30 × height60 inches, Window Size, Regular, four-sided L Outside (VL Outside for Vinyl / US-made), 3.5-inch louver, 101_White, panel L, quantity1. Billable frame area = round((30+3.5)×(60+3.5)/144, 3) = 14.773 square feet. The portal rounds this area; truncation would give14.772 and does not match these fixtures.

| Material | Portal dealer rate inferred from fixture | Portal line before tax | Current catalog rate reviewed | Result |
|---|---:|---:|---:|---|
| Bassia | 13.50/sqft | 199.436 | 13.50 | Fixture agrees; no universal pricing approval |
| Sycamore | 10.95/sqft | 161.764 | 11.95 | Conflict, unchanged |
| Vinyl | 12.00/sqft | 177.276 | 11.00 | Conflict, unchanged |
| VLO | 12.00/sqft | 177.276 | 10.35 | Conflict, unchanged |
| Ash | 22.00/sqft | 325.006 | No program | Missing destination, rate evidence limited to fixture |
| US Made Vinyl | 13.65/sqft | 201.651 | 13.60 | Conflict, unchanged |

No dealer factor, customer markup, shipping, tax or selling-price policy was changed. A sample rate does not establish a full surcharge schedule or effective date.

## Missing shade assortment

The current order-program menu has Onyx Signature, Onyx Lux and Woven; no current Onyx shade CRM catalog destination was found. Exact Signature menu inventory is in `signature-assortment.json`: **33 fabric groups and293 color identities** (Roller20/185, Sunscreen3/33, Zebra10/75). Each row has source, observation date, effective-date unknown, exact color IDs/names and the exception `missing_catalog_and_grids`. These must receive distinct source-backed destinations; existing shutter IDs are unsuitable.

Signature visible options include IM/OM (IM factory width deduction1/8 inch), continuous cord/cordless/motorization, product-specific cassettes, cassette colors/wrap, cord color/position, bottom rail/color/wrap, same-order side-by-side alignment conditions and custom cord-length surcharge $10. Roller and Zebra cassette/bottom-rail menus differ. Motor variants, combinations, grids, dimensions, freight and effective schedule remain unverified. Lux and Woven enumeration is complete below.

## Draft preservation / next live proof

Unsubmitted comparison drafts preserved:123320 / AUDIT0920ONYX (five imported shutter lines);123321 / AUDIT0920US (one US-made line);123322 / AUDIT0920SIGN (three shade price fixtures);123323 / AUDIT0920LUX (three fixtures);123324 / AUDIT0920WOVEN (two fixtures). Side mark INTERNAL AUDIT DO NOT ORDER. No checkout, order placement, warranty acceptance or payment performed.

After integration/deployment, parent must verify the actual CRM: US-made only Pure White/White, 3.5-inch louvers, H2, White hinges and five current frames; VLO current wood frames and no Butter/Gray/H1; Bassia painted/stained separation and exact codes; invalid saved/server configurations blocked; save/reopen representative quotes preserves selection and customer output. Existing manual-price holds must remain visible. New shade destinations and Ash remain unresolved until catalog/rules/grids are implemented and live-proven.

## Completed Lux / Woven assortment enumeration

`lux-assortment.json` captures every visible Lux product/pattern/color entry: Fabric Blinds4 groups/108 colors, Honeycomb6/144, Sheerview6/65, total16/317. `woven-assortment.json` captures Walden Premier36 and Walden Select57 colors, total2/93. Signature + Lux + Woven total **51 groups and703 exact color identities**, all without current CRM destinations. Source anomalies such as `FB_PG2_50446` appearing under FB_PG1, `HC_PG01_65100D` under FB_PG4, and repeat color names with different codes are deliberately preserved, not silently normalized.

Lux honeycomb offers cordless, continuous cord, TDBU cordless and motorization; tile cut displays $7 per blind. Fabric blinds offer cordless/motor, Dover/Westminister/no valance, return options and cloth tapes. Sheerview offers continuous cord/cordless/motor, curved/flat valance, cord/metal/plastic chain and $10 custom cord-length surcharge. These are menu observations; dependent motor/size/assembly prices still need grids.

Woven shows IM deduction3/8 inch, six liner choices, four edge bindings, continuous cord/cordless/TDBU($150)/wand motor($200)/remote motor($250), single/2-on-1/3-on-1 and maximum custom valance120 inches. Charges are dealer-form labels and do not establish 805 selling prices. Lux audit draft123323/AUDIT0920LUX contains three baseline fixtures; Woven draft123324/AUDIT0920WOVEN contains two. All remain unsubmitted.

Authenticated Forms was rechecked: https://admin.onyxshutters.com/Forms.aspx exposes only shutter order sheet, shade order sheet, check-by-fax and2020 Reference Manual. No current Signature/Lux/Woven/Ash price-grid download is linked. A focused official-domain search also found no current shade price guide. The official indoor page https://www.onyxshutters.com/shades corroborates the six indoor product types. https://www.onyxshutters.com/outdoor-shades documents a current outdoor-shade offering, absent from the authenticated five-program order menu and CRM; exact series, fabrics, controls, dimensions, pricing and ordering route remain an additional unresolved exception.


## Per-color mapping ledger and shade cost fixtures

`shade-mapping-ledger.csv` records all 703 color identities individually, with exact source pattern/color IDs, unknown effective date, current CRM destination absent, proposed product destinations, unresolved price grid and availability exception. Proposed destinations are audit recommendations, not implemented runtime IDs. All 703 remain `missing_catalog_and_grids`; none is represented as verified live.

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

New implementation (awaiting integration/deployment/live proof) adds **eight separate catalog destinations,52 programs and734 source color entries**: `onyx_signature_roller`, `onyx_signature_sunscreen`, `onyx_signature_zebra`, `onyx_lux_fabric_blinds`, `onyx_lux_honeycomb`, `onyx_lux_sheerview`, `onyx_woven`, `onyx_ash_shutters`. The shade ledger's current destination column now names implemented IDs; its implementation-status column distinguishes this from verified live. Earlier missing-destination findings above describe the audited starting state.

Each current source pattern has its own program with an empty, explicitly manual-required grid. The dedicated Onyx controls save exact collection/color IDs and observed mount/control or Ash frame/shape/louver/tilt choices. Both server and picker enforce product/collection/color identity. Menus are not universal compatibility certification; missing grid, dimensional and conditional evidence keeps all new destinations blocked for customer pricing/delivery. Existing shutter IDs, provisional rates and selling policy remain unchanged. Source evidence is pinned separately as `onyx-shade-assortment-2026-09-20`; the effective date remains unpublished. Outdoor shade series/fabrics/ordering remain unresolved and are not represented by invented choices.

Validation for the held destinations:54 focused catalog/source/adapter/builder tests passed; an earlier62-test focused run covered the new exhaustive selection test plus existing Onyx pricing and42 DesignCard routing checks. TypeScript and whitespace checks passed. The734-row round-trip check exercises saved JSON and the actual server adapter; production save/reopen for these new destinations still awaits deployment.
