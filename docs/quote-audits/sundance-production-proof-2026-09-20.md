# Sundance production verification — September 20, 2026

Production draft **805-0335**, customer **Sundance Catalog Verification 2026-09-20**, is internal and unsent. Its notes prohibit sending, selling, payment collection and ordering. Manual values 123.45 and 234.56 are persistence fixtures, not price authority.

## Verified in production

The draft was saved, closed to Quotes, and reopened through **Open quote 805-0335**.

| Line | Persisted configuration | Pricing proof limit |
|---|---|---|
| Living Room | Cellular 36×60; 3/4-inch; Blackout; exact PU422SS-766, Cell-In-A-Cell Classic Gray | Manual fixture 123.45 persists; no automatic-price certification. Changing cell size removes incompatible identities and clears the previous selection. |
| Office | Glydea drapery track 96×84; IRISMO 45 lithium-ion rechargeable 0.8Nm; Bronze; Motor Right; curved track No; Split; Ripple Fold; Situo 5 | Manual fixture 234.56 persists; missing dimensional-grid warning remains. |
| Kitchen | Stock vertical 42×60; Off-White; Square corner valance; width cut-down Yes; height cut-down No | Intentionally unpriced. Pickup-only and manual-charge notice visible. |
| Family Room | Walden Premier 36×60; Black-out liner `sundance_walden_premier_option_p20_t2`; wide twill binding `sundance_walden_premier_option_p21_t2`; Chocolate liner; movable liner Yes | Intentionally unpriced. Exact fabric identity proof awaits the subsequent fabric-selector deployment. |

After reopening the four-line draft, production correctly displays **Pricing incomplete**, **Total unavailable**, and **2 windows need pricing**. All four lines retain Sundance's **QUOTE ONLY** account/configuration gate. The previously priced two-line draft total was 358.01 before adding the two unpriced lines.

On release `8f78c858`, the customer Contract preview retained exact cellular identity and complete neutral track descriptions: rechargeable 45/lithium-ion/0.8Nm motor, Motor Right, five-channel remote, Split, Straight, Bronze and Ripple Fold. This confirms presentation and persistence, not supplier price approval.

On release `bc4bea39`, with the full Sundance product list selected, a normal direct click on **36×60** opened the Width dialog with the correct measurements. No keyboard workaround was needed. The exact-product picker has its own bounded scroll area; the quote header no longer obscures line controls.

## Preserved dealer evidence

Authenticated KEN HILL account, unsubmitted order **805 CATALOG AUDIT 0920 DO NOT ORDER**, order ID `a2cb0fbf-e522-4509-b094-8129dea40dda`, contains seven saved comparison lines. The five cellular comparisons are described in the cellular ledger. Walden line 6 (`a2cb280a-74ae-489b-aaf8-1fbb8f9d14bd`) preserves Aires White 36×60 without liner; line 7 (`a2cb2818-4d0f-4dab-84f4-5155205879a8`) preserves the Blackout comparison. Reopened order list confirms their respective net values 318.60 and 357.75. The latter exposes the published-versus-portal liner discrepancy recorded in the Walden audit. No order was submitted.

This evidence does not mark any complete Sundance family verified for automatic pricing. Full compatibility, account terms, unresolved dealer identities and exact option charges remain explicit exceptions.

## Walden exact identities on release d28bd77d

The same draft now contains five lines. Premier Family Room retains exact **E-M01 Aires White**, 36×60, Black-out liner, wide twill binding, Chocolate and movable liner Yes. Select Dining Room retains exact **WS-0602 Pudong White**, 36×60, light-filtering liner `sundance_walden_select_option_p19_t1`, edge binding `sundance_walden_select_option_p19_t3` and Gray liner. Both were closed and reopened through the Quotes list with all selections intact. Selecting Aires White initially cleared the previous accessory choices as intended; the verified choices were then selected again. Source-only material codes were absent from the new-choice menus. The three unpriced stock/Walden lines correctly leave the reopened quote **Pricing incomplete — 3 windows need pricing**.

## Horizontal identities on release 04d74891

Two more internal lines were saved and reopened in 805-0335. Hall retains **Advantage II 2-inch, Fog 904-101, Crown valance, 36×60**. Before the final selection, Natural FS-411 visibly showed its 5% retail surcharge and trapezoid-bottomrail references. Changing from Natural with Flat valance to Fog cleared Flat and offered only Crown. Foyer retains **1-inch aluminum, 8014 Matte White, 8-Gauge, 36×60**; its 20% retail surcharge reference remains visible after reopening. Both lines remain intentionally unpriced. The seven-line builder reports **Pricing incomplete — 5 windows need pricing**.

This proof exposed a separate list-display defect: the Quotes list still showed the prior 358.01 manual fixture subtotal while the reopened builder correctly withheld a total. The persisted line identity proof passes; list completeness requires a separate fix. None of these values authorize dealer or customer pricing.

## Louvolite family routing and quote-list completeness — production 827159e4

Reloaded public `www.805shutters.com/crm/` after the deployment and opened Quotes. The real persisted-design relation query succeeded; internal unsent draft **805-0335** now displays **Pricing incomplete** in the list instead of its stale $358.01 fixture subtotal.

Before the reload, added two separate 36 × 60-inch unpriced lines and observed Quote saved. After reopening:

- Line 8, Breakfast Nook, Louvolite roller: `ARGENT-CHAMPAGNE B/O-80`, **Argent (Blackout) · Group D**, exact color ID `sundance_louvolite_roller:dealer:29e2f862f6db`, collection `sundance_louvolite_roller:collection:c8070d50c3df`.
- Line 9, Primary Bedroom, Louvolite Europanels: same exact dealer label, **Argent Blackout · Group E**, exact color ID `sundance_louvolite_europanels:dealer:29e2f862f6db`, collection `sundance_louvolite_europanels:collection:2be9a98bafa7`.

The family-specific values survived the full reload/reopen. Builder reads **Pricing incomplete / Total unavailable / 7 windows need pricing**. The draft remains explicitly internal and unsent; existing manual fixture prices are not pricing authority. This proves identity and incomplete-price persistence, not dealer account pricing or full configuration compatibility.

## SheerView guide-only identity — production b907fd2e

In internal unsent draft 805-0335, added line 10 Primary Bathroom, 36 × 60 inches, selected **S65XN100-4 · Carbon · 2.5-inch Striped Collection · Light Filtering**. Observed Quote saved, closed the builder, and reopened the persisted draft. Vane size `2.5`, light control `Light Filtering`, and exact color ID `sundance_sheerview:S65XN100-4` all remained selected. The warning that this color is present in the current guide but absent from the captured dealer menu also remained visible. Total remained unavailable with eight windows requiring pricing. This confirms that the availability exception is preserved in the actual CRM; it does not verify current dealer orderability or price.

## Zebra, Portfolio and custom vertical persistence — production 1acd1e85

Verified on www.805shutters.com after parent confirmed release `1acd1e85` live. Existing internal unsent Draft **805-0335** now contains thirteen lines; no order, message, payment or sale was submitted.

- Bedroom 1, 36 × 60: `ORLANDO BLACKOUT BL2901` saves and reopens as **Orlando Blackout · Group 4**, exact color `sundance_zebra:dealer:f6365af13320`, collection `sundance_zebra:collection:b5cbe30ab3c5`. The separate Orlando light-filtering Group 2 was not used. Room Darkening, 118-inch fabric width and unverified railroading remain visibly identified.
- Bedroom 2, 36 × 60: Flat style offered 82 exact material choices and excluded Alese. Selected CLL01 Callaway Granite Flat, then changed to Knife Pleat: the old material selection cleared. Selected `ASE01 · Alese Cashew · Knife Pleat`; full browser reload and quote reopen retained both style and exact identity `sundance_portfolio_roman:ASE01:Knife Pleat`.
- Bedroom 3, 36 × 60: Custom Alexander Ivory saved and reopened with exact identity `sundance_vertical_essence:custom:56fd60247729`; Rounded valance retained the correct group-specific `sundance_vertical_essence_valance_p6_t3`. The existing Kitchen Stock offering remained Stock, separate from the new custom identity.

The builder shows **Total unavailable / 11 windows need pricing** and the actual Quotes list shows **Draft / Pricing incomplete**. Earlier manual 123.45 and 234.56 fixture amounts remain explicitly labeled internal test values, not account or selling authority. This verifies identity/style/valance persistence, not automatic pricing or exhaustive configuration correctness.

Observed a separate presentation defect: the Zebra's exact Room Darkening attribute generated a legacy generic 20% Light Control chip. It did not calculate a quote price because Sundance remains held. A narrow follow-up suppresses generic automatically inferred surcharge choices/chips for Sundance while preserving explicitly saved charges; live verification of that follow-up is pending.

## Exterior Zip and generic surcharge presentation — production 418226b6

After parent verified Zip release138be0b3, added Guest Room line14 at96×84 with exact `PROSHIELD 4% BLUE SKY · Premium`. Waited for Quote saved, reloaded the full browser after release418226b6, and reopened805-0335. The premium material label/class and96×84 dimensions persisted. Its source warning still explicitly excludes motor cost and requests current rate/minimum/rounding confirmation. No customer price was entered. Builder remains Total unavailable with12 unpriced windows.

On the same fresh page, Bedroom1 retains Orlando Blackout Group4/BL2901. The unsupported generic20% Light Control chip and generic Add Surcharge button are gone; the actual Room Darkening/fabric-width source description remains. This closes the narrow presentation regression proof.

Observed remaining copy issue: the Zip line's missing dimensional-grid/manual-price condition is presented under “Manufacturer size warning” and “exceeds a manufacturer restriction.” The selected96×84 is within the published220×110 envelope; absence of an approved price calculation is not an oversize finding. This needs a separate wording/routing correction and does not invalidate identity persistence.

### SheerView controls, release 3b9257e5

In internal unsent 805-0335, line 10 (Primary Bathroom, 36×60, Carbon S65XN100-4) the live form exposed No Drill after choosing Cordless. Changing to Continuous Cord Loop cleared No Drill and removed it from the menu. Selected Flat Square, Safe Wand and Single; waited for Quote saved, closed and reopened the quote. All three values and the exact material persisted. The source-only availability warning remained, and no manual price was entered. This verifies the saved control path, not manufacturer orderability or approved account price.
