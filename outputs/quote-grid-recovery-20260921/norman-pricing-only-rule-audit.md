# Norman quote-only validation audit — 2026-09-21

## Decision and implementation boundary

Quotes use the current catalog grid plus explicitly priced options. Installation/fabrication readiness remains available to the separate ordering validator; it does not authorize a different fabric, invent a cell, infer a charge count, or change saved dimensions. Historical order-mode validation is unchanged. Current quote callers opt into `validationPurpose: 'quote'`.

Implementation: `src/lib/quote-v2/quote-pricing-policy.ts`. Exact audited rule IDs are enumerated there, with source-page comments. Unknown IDs still block. Dimension-profile matching is restricted to Norman Honeycomb and motor manufacturing envelopes. Roller min/max/capacity IDs are explicit. No generic `dimension`, `geometry`, `source`, or `required` substring bypass exists.

## Family inventory and classification

| Family | Quote-independent evidence now treated as ordering warnings | Price evidence retained |
|---|---|---|
| Roller | Source manufacturing min/max/capacity; chain length, side, material and safety-device record (September retail p20 says standard/stainless chain no extra charge); mounting clearances | Exact color/program and priced operating system/top treatment; real grid cell; component widths/count; explicit motor/accessory identities; hold-down charge evidence |
| Roman | Recess, headrail clearance, chain location/length, pole length, wand/channel/network choices, fabric manufacturing width/height envelopes and matching | Exact front/rear programs, fold/lining/paid options, actual common-valance widths, purchased pole/accessory quantity, shim quantity, actual grid cell |
| Honeycomb | Recess and holder, mounting plate, pole length/finishes, manufacturing size/slope/shape net measurements, cut-out geometry, side-by-side matching | Fabric/cell/application price identity, dual-fabric price inputs, actual component dimensions used for pricing, paid hardware quantities, priced frame/option identity |
| Vertical Honeycomb | Recess, Butt Together matching (guide p38 explicitly prices shades separately); unpurchased attachment choice | Attachment still required when shim layers are purchased because it changes quantity. Day & Night pricing widths and unpriced baseboard cut-out remain genuine price exceptions |
| SmartFold | Recess, outside clearance, manufacturing limits, fold/chain geometry and side-by-side matching | Current fabric/grid, actual valance and accessory price identities, shared-valance width/charge counts, effective motor revision |
| PerfectSheer | Manufacturing limits, recess, chain clearance/length and motor positions | Actual fabric/opacity, priced valance/control/accessory identity and quantities |
| SmartDrape | Manufacturing size/area, motor position, wand length, ceiling-pocket geometry and same-room/mount matching | Stack/motor count, valid priced fabric, selected keystone joint count, source-bracket-dependent accessory quantities and actual charge identity |
| CityLights | Net manufacturing envelope, wand location/drop, mounting support and matching | Slat/color program, Privacy/SmartPrivacy and finish adders, side-support purchase and shim quantities, actual retail-grid boundary |
| Normandy Wood blinds | Net manufacturing envelope, wand/drop, mount/return geometry, cut-out width/height, keystone placement and matching | Exact color/finish, paid valance/cut-out side and quantity, actual common-valance price width, keystone count and grid boundary |
| Ultimate Faux Wood | Same source-only manufacturing/installation separation | Every independent blind width, actual finish/valance charge, common-valance and multiple-keystone unresolved charge basis |
| SmartPrivacy Faux Wood | Net manufacturing envelope, wand/drop, mounting and returns | Every independent blind width, slat/finish/program and paid options |
| Synchrony Vertical | Manufacturing envelope, wand orientation/drop, hardware finish, mounting and pair alignment | Exact vane/color price group, real grid, selected shim count and known control/option identity |
| Palladian Shelf | Depth/increment, load and installation mounting (September guide p5) | Width grid, finish, with-product/without-product program, eligible linked product and actual quantity |
| Six shutter programs | Detailed panel heights/width limits, support/sill gaps, divider and split locations, louver counts, header/casing/baseboard/pivot construction, specialized-track and French-door manufacturing records | Program/finish, louver/tilt price identity, premium/custom-charge evidence, actual billable frame dimensions/sides and frame price addition, purchased panel-based quantities |
| San Clemente Honeycomb/Faux and Contract Faux/Vertical | Source dimensions, recess, wand and mounting support | Existing held destination remains held when there is no price grid/approved option amount; no substitute Portrait/Ultimate grid is used |
| Seven ancillary destinations | Applicable installation/work-order metadata does not establish a price | Roller valance-only/separate valance, Ultimate/SmartPrivacy valance-only, Roman yard/pillow and SmartDrape replacement packs still require their actual price source; empty/manual grids are not fabricated |

Source authority is the provenance carried by each original rule: September Roman pp13–24; Honeycomb pp6/10/37–49; motorization September 16 pp10–18/21–24/66–85; SmartFold September pp22–23/34; PerfectSheer/SmartDrape pp6/17–23/32–33; CityLights pp7–8/15–19; Normandy Wood pp7–8/15–20; Ultimate Faux pp6–7/10–15; SmartPrivacy pp7–11; Synchrony pp6–7/10–12; Palladian p5; each of the six shutter binders' construction sections. Original rule records retain exact source IDs/pages, including warnings.

## Mixed rules deliberately retained

- Vertical attachment determines bracket+floor-bracket shim quantity when layers > 0. Without shims, the mounting choice is only ordering evidence.
- Shim layer validation combines a numerical purchase count and compatibility: invalid/nonfinite counts remain blocked.
- Common-valance and coupled-shade component widths are real pricing inputs; no equal-width assumption.
- Shared power-panel assignment controls whether a panel is charged once and how many are purchased. It cannot simply disappear.
- Shutter window-size/frame-size choice and frame-side additions determine billable square footage. Net manufacturing panel schedules do not replace this input.
- Custom shutter divider charges, premium finish charges, Ultimate Faux multi-keystone charge basis and unknown accessory charges retain their exact exceptions.
- Motor/tube capacity is not order approval; the selected priced motor remains selected and is charged, never silently upgraded.

## Verification

`norman-pricing-only.test.ts` compares real engine base, surcharge lines and final amount with/without installation measurements for all 14 core families; additionally exercises all six shutter programs, source-only motor envelopes, conditional vertical shim attachment, actual out-of-grid rejection, unknown price-ID rejection, and unchanged strict ordering behavior. The existing Roman/Onyx charge and actual NA400 Roller regression suites remain part of focused validation. These are representative price-flow regressions, not a claim that every possible option permutation is source-certified or live-tested.

Parent integration additionally owns remaining UI field suppression, current quote caller/date policy, full suite/build and authenticated save/reopen proof. A tested policy is not itself a production deployment or live quote proof.


## Mixed-rule review and shutter form

- Roman `banding_layout` selects the manufacturing tape arrangement; the paid fold style determines the charge. `valance_returns` changes the finishing record, not priced width. Both are ordering warnings.
- Wood `returns`/`return_size`, cutout width/height, and keystone layout/spacing change manufacturing coordinates only. The actual cutout side/type/count, valance price width, and keystone purchase count stay required.
- Shutter Bi-fold `header`, `fascia`, and `frame_buildout` describe construction. They do not feed `resolveNormanShutterWindowSizePricing`, which still requires actual measurement basis, ordered dimensions, exact frame, side count and applicable mount. Unknown frame-price additions stay blocked.
- Shutter `panel_count` in construction validators checks whether the finished-panel schedule is complete. Actual priced layout and panel-based option counts are retained. Double Hung `extra_hinge` was already a warning; no new charge is inferred.
- Specialty `frame_sides` checks compatibility of the construction record. The billable main frame-side selection remains required and visible. French Door `source_missing` remains hard because the exact offered program/type has not been established.
- Current SmartFold quote-only eligibility now admits door-placement and matching-only metadata; historical/order eligibility remains unchanged. Common-valance assemblies, custom/unknown charges, different shade price structures, and unrecognized motors remain held.
- Shutter `pricingOnly` forms retain application, motor, exact layout/type/shape/frame, frame sides, specialty panel quantity and divider sizes/counts with custom-surcharge markers. They hide finished-panel widths/heights, louver counts, recess/support, header/casing measurements, factory geometry, division locations and drawing references. Existing versioned manufacturing records remain intact when a priced option changes. Ordering-mode forms remain available.

Additional verification: actual source motor profile IDs with hyphens/decimal tube sizes; SmartFold door/matching price invariance; seven shutter application forms preserve stored records during motor edits; ordering-mode measurement controls remain present. Focused engine suites passed 123 tests; focused Norman UI suites passed 15 tests before final combined verification.
