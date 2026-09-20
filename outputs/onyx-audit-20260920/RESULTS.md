# Onyx current catalog audit — 2026-09-20

Status: supported shutter selection fixes implemented and tested; not deployed or verified live by this agent. Complete Onyx assortment/pricing certification remains open.

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

Signature visible options include IM/OM (IM factory width deduction1/8 inch), continuous cord/cordless/motorization, product-specific cassettes, cassette colors/wrap, cord color/position, bottom rail/color/wrap, same-order side-by-side alignment conditions and custom cord-length surcharge $10. Roller and Zebra cassette/bottom-rail menus differ. Motor variants, combinations, grids, dimensions, freight and effective schedule remain unverified. Lux and Woven enumeration is in progress.

## Draft preservation / next live proof

Unsubmitted comparison drafts preserved:123320 / AUDIT0920ONYX (five imported shutter lines);123321 / AUDIT0920US (one US-made line);123322 / AUDIT0920SIGN (empty assortment inspection). Side mark INTERNAL AUDIT DO NOT ORDER. No checkout, order placement, warranty acceptance or payment performed.

After integration/deployment, parent must verify the actual CRM: US-made only Pure White/White, 3.5-inch louvers, H2, White hinges and five current frames; VLO current wood frames and no Butter/Gray/H1; Bassia painted/stained separation and exact codes; invalid saved/server configurations blocked; save/reopen representative quotes preserves selection and customer output. Existing manual-price holds must remain visible. New shade destinations and Ash remain unresolved until catalog/rules/grids are implemented and live-proven.

## Completed Lux / Woven assortment enumeration

`lux-assortment.json` captures every visible Lux product/pattern/color entry: Fabric Blinds4 groups/108 colors, Honeycomb6/144, Sheerview6/65, total16/317. `woven-assortment.json` captures Walden Premier36 and Walden Select57 colors, total2/93. Signature + Lux + Woven total **51 groups and703 exact color identities**, all without current CRM destinations. Source anomalies such as `FB_PG2_50446` appearing under FB_PG1, `HC_PG01_65100D` under FB_PG4, and repeat color names with different codes are deliberately preserved, not silently normalized.

Lux honeycomb offers cordless, continuous cord, TDBU cordless and motorization; tile cut displays $7 per blind. Fabric blinds offer cordless/motor, Dover/Westminister/no valance, return options and cloth tapes. Sheerview offers continuous cord/cordless/motor, curved/flat valance, cord/metal/plastic chain and $10 custom cord-length surcharge. These are menu observations; dependent motor/size/assembly prices still need grids.

Woven shows IM deduction3/8 inch, six liner choices, four edge bindings, continuous cord/cordless/TDBU($150)/wand motor($200)/remote motor($250), single/2-on-1/3-on-1 and maximum custom valance120 inches. Charges are dealer-form labels and do not establish 805 selling prices. Lux audit draft123323/AUDIT0920LUX is empty; Woven audit header also preserved with PO AUDIT0920WOVEN, empty.

Authenticated Forms was rechecked: https://admin.onyxshutters.com/Forms.aspx exposes only shutter order sheet, shade order sheet, check-by-fax and2020 Reference Manual. No current Signature/Lux/Woven/Ash price-grid download is linked. A focused official-domain search also found no current shade price guide. The official indoor page https://www.onyxshutters.com/shades corroborates the six indoor product types. https://www.onyxshutters.com/outdoor-shades documents a current outdoor-shade offering, absent from the authenticated five-program order menu and CRM; exact series, fabrics, controls, dimensions, pricing and ordering route remain an additional unresolved exception.
