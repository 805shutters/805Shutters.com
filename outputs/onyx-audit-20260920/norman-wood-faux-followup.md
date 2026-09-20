# Ultimate Wood / Faux Wood rule followup — September 20, 2026

Bounded source audit against the parent implementation in `805-norman-complete-20260918`. The current guides' complete text was compared with `norman-wood`, `norman-ultimate-faux`, and their assembly rules. Wood pp8,24 and Faux p15 were also rendered and visually inspected. No dealer factors, retail grids, freight rules or selling-price policy were changed.

Sources in `805/outputs/catalog-audit-2026-09-17/current-sources`:

- Ultimate Wood Blinds Guide.pdf: SHA256 `ccad35711bce47f7dbe1455fcc0152e7fb7ebd37ebfff1689fff840e44c0a43d`.
- Ultimate FW Blinds Guide.pdf: SHA256 `b0cc6132087ad8f10f770a2d001415df3db54c13b098006645eea3f64d8e957c`.

## Implemented corrections

1. **Wood side-support fasteners (p24).** The source assigns four M4 nut-and-bolt sets to side mounting. Previously the derived record supplied four only for `Side Only`, omitting them for side brackets with the required top support above37 inches. Current records count four whenever side mounting is selected.
2. **Wood standard valance clips (p24).** The source uses net blind width X for standard valances and custom valance length L for custom valances. Previously all clip counts used finished valance width. A37-inch net blind with ordinary38-inch outside valance incorrectly received three clips instead of two. Current records use the exact appropriate measurement basis; shared/custom valances retain their explicit finished width.
3. **Faux hardware schedule (p15).** Current saved records now include mounting/hold-down screws, four side-support fasteners, nominal ladders/inner cords, and valance clip schedule. Brackets and existing option charges are unchanged. The nominal ladder count retains the guide's warning that production may vary near range boundaries.
4. **Wood 11¾-inch running-change wand (p8).** The guide's table lists11¾ as a running-change default for blind heights≤36 inches; it is not in the all-height optional-wand column. The current picker exposes this request only at≤36 inches. Selecting it produces an explicit factory-availability hold. The established17¾ default remains unchanged, as do historical dated rules. No implementation assumes this running change has reached805's account.

Effective implementation date is September20,2026. Wood and Faux each have a new catalog identity. Dates beforeSeptember20 retain earlier hardware records and wand choices; historical snapshots are not rewritten. One narrow Wood picker call uses the height-dependent choices; all other UI routing is unchanged.

## Exact source schedules

| Net width | Faux nominal ladders | Inner cords |
|---|---:|---:|
|≤24|2|4|
|>24–37|3|4|
|>37–50|4|4|
|>50–63|5|8|
|>63–76|6|8|
|>76–89|7|8|
|>89–96|8|8|

Clips for standard net blind width or explicit custom/common valance length:≤37→2;>37 and<60→3;60–96→4. Above96 inches, Wood says4+; Faux says5–17 with `{fx(L-13)/24+1}` but does not define the rounding operator. These remain nullable exact quantities with source bounds and a factory-confirmation flag; no invented integer is persisted.

Screws: two mounting screws per bracket; ordinary length1¼ inches, shim-supported length2 inches; one¾-inch screw per hold-down bracket. Side-mount nut-and-bolt sets:4. These are documented hardware contents, not newly invented retail surcharges.

## Audited existing rules retained

- Net width6½–96, height16–96, Wood64ft²/Faux48ft² limits;⅜-inch inside deduction; center tilt/no lift below15 inches.
- Source slat/color/finish routing, wand drop defaults, mount depths and return dimensions.
- Outside-only shims, side-only37-inch boundary and top support above37 inches.
- Up tofour common-valance blinds,⅜–12-inch gaps, shared choice consistency, shortest-blind wand defaults, matching-group same-height/slat/finish rules, outer-edge-only common cutouts.
- Cutout ranges, one type per side, keystone count/spacing, Wood splice count ceiling and exact existing dealer-reconciled valance charging.

## Remaining source / account exceptions

- **Wood short wand:** running-change timing has no definite date/account availability. The17¾ vs11¾ default for heights≤36 inches, including mixed-height common assemblies, requires dealer confirmation. New11¾ requests remain held.
- **Long valance clips:** exact Wood4+ quantity and Faux formula rounding need factory interpretation; no exact quantity claimed.
- **Faux nominal ladders near width thresholds:** source explicitly permits variation. Recorded schedule is nominal, not a factory guarantee.
- **Wood mounting with valance:** diagram1⅜ versus return-table1⅝ minimum remains the existing source-conflict hold; untouched.
- **Final inside grid boundary:** net size can be valid while ordered width exceeds96-inch final retail column; existing pricing hold retained.
- **Faux common/custom/standalone valance and multiple-keystone charges:** printed table does not fully establish billing width or per-piece basis. Existing common/multiple-keystone holds retained. No standalone price was inferred; custom-width basis still needs portal evidence.
- No new claim that every option is fully dealer verified or live. Production verification of the new record fields and short-wand hold remains with the parent release workflow.

## Regression checks

226 focused tests passed covering all previously priced Wood/Faux configurations, assembly checks, exact new hardware thresholds, Wood short-wand height/date boundaries, historical record preservation and JSON serialization. Typecheck passed. The final combined full suite passed 5,572 tests with 28 skipped (543 test files passed, 5 skipped), including the six additional source-dated withdrawal cases.

## Roman revision-table clarification requested by parent

The same current `Roman Shade Guide.pdf` (SHA256 `d312848c45bf49ee3c06a6ae11f3f7b4cd7b53d88984f114598154c54628d151`) p2 was rendered and inspected:

- September1,2026 row: “Discontinued AA0305 F0210 Corn Silk White from Taylor collection & Roman Day & Night Roller Fabric: Maize.”
- April10,2026 row: “Discontinued AA0901 F1050 Pewter 8027 & AA0902 F1055 Flax 0024 from Libeco Belgian Linen collection.”
- Other dated rows explicitly withdraw F1068 onMay11,2026; F1054 andF0237 onFebruary1,2026; F1052 onJanuary1,2026.

The ancillary report/ledger now classifies F1050/F1055 as discontinuedApril10 rather than unresolved absence. They were already excluded from the active201-row assortment, so this evidence correction does not change offered colors or pricing.

The main withdrawal registry already enforced Taylor F0210 on September 1. It lacked the six earlier dated withdrawals listed above; they are now enforced on their exact source dates, including case/space-normalized submitted color codes. Tests verify the day before and day of each withdrawal. Existing color identities and historical snapshots are retained. Current picker searches already excluded these absent colors; the added server rule closes direct saved-configuration bypass and provides the precise source reason.
