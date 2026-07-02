# Norman Portrait Honeycomb order form — option & cascade map

Captured 2026-07-01 from the live Norman dealer portal (QB_Order.asp inline honeycomb flow)
by toggling every selection live and state-diffing the form, plus a cell-by-cell audit of the
2026 Retail Guide (effective July 1, 2026) honeycomb pages 10–14 against the repo pricing
data. This is the source of truth for making the 805 CRM quote builder's Honeycomb Shades
flow mirror Norman's ordering flow, so reps capture every detail Norman will ask for — in
the same dependency order.

**805 builder mapping decisions (2026-07-01):**

- Rep-facing fields live in the CRM quote builder (`src/mts-quote/components/crm/quote-builder/DesignCard.tsx`, Honeycomb Shades case) with constants in `src/mts-quote/lib/quoteConstants.ts` (HONEYCOMB_* section) and dealer fabric availability helpers in `src/mts-quote/lib/honeycombDealerFabrics.ts`.
- Norman's "Shade Size" list maps 1:1 to `HONEYCOMB_CELL_SIZES`; Norman "Decoflex" = 805 "SmartFit with Frame", "Decoflex for skylights" = "SmartFit Sloped with Frame" (same fabric set). Legacy stored labels ("SmartFit® with Frame", "SmartFit® for Sloped Windows with Frame") are canonicalized via `canonicalizeHoneycombCellSize`.
- Norman's *destructive resets* are replaced by *validity-based clearing*: changing the operating system clears chain/pole/motor/back-fabric fields only when they no longer apply; changing the shade size clears the fabric only when its color is no longer offered for the new size on the dealer form.
- Norman keeps all 14 operating systems enabled at the DOM level for every non-frame size — the 805 builder mirrors that permissively (`getHoneycombOperatingSystemsFor`); only the SmartFit-with-Frame sizes are restricted to the SmartFit family.
- Fabric availability per shade size was captured from the logged-in dealer form (the endpoint is not public) and is embedded in `scripts/generate-honeycomb-dealer-fabrics.mjs`, which generates `src/lib/quote/norman-honeycomb-dealer-fabrics.generated.ts`. The fabric picker (`src/mts-quote/lib/productColorCatalog.ts`) filters colors by that availability once a shade size is selected, staying permissive when the data has no entry.
- Day & Night systems add a "Back Shade Fabric" select (the dealer fabric labels for the size). The back *color* lists are too numerous to mirror — the rep picks the front color via the fabric search and records back-color specifics in notes if needed.
- Norman's magnetic hold-down color list was not captured for honeycomb — the builder records the hold-down choice (None | Standard | Magnetic) only.
- Cutout details (dplHCCutOutNum), shim quantity, remote quantity, clip yes/no, and window type were not ported as structured fields in v1 — use Special Instructions / surcharge chips.
- Pricing: motor/remote/hub attach via the existing `MOTORIZATION_OPTIONS` name lookup ("Rechargeable Battery (Wireless/Wired Charging Wand)" $482 Norman; "Automate Home Battery Pack"/"AC Adapter" $682). Operating-system surcharges (Cord Loop $73, SmartRelease $89, TDBU|TD $89, SmartFit family, Day & Night 100%), the 20% fabric surcharge, and the magnetic hold down $28 are automatic (`getAutomaticOptionSurcharges`, Honeycomb block).

---

# Live-verified cascades (state-diffed on the real form, 2026-07-01)

## Shade sizes (cmbshadesize1)

3/8" Single Cell | 9/16" Single Cell | 3/4" Single Cell | 1 1/4" Single Cell | 1/2" Double Cell | 3/4" Double Cell | Decoflex (= SmartFit with Frame) | Decoflex for skylights (= SmartFit for Sloped Windows with Frame)

## Operating systems (RadShadeCordType1) — all 14 enabled for every size at DOM level

| Norman code | Label (805 builder value) |
|---|---|
| CORDLESS2 | SmartRise Cordless |
| CLTDBU | Cordless TDBU* |
| CLDAYNIGHT | Cordless Day & Night |
| SMARTFIT | SmartFit* |
| CORDLOOP | Cord Loop* |
| SRCORDLOOP | SmartRelease* |
| LPTDBU | Cord Loop TD* |
| LPDAYNIGHT | Cord Loop Day & Night* |
| SMARTFIT2 | SmartFit for Sloped Windows* |
| SFDAYNIGHT | SmartFit Dual Shade* |
| MOTOR | Motorized* |
| MTTDBU | Motorized TD* |
| MTTDBU2 | Motorized TDBU* |
| MTDAYNIGHT | Motorized Day & Night* |

(* = surcharge item)

## Per-OS reveals (state-diffed live, 3/8" single)

- **CORDLESS2 (SmartRise Cordless)**: shade type 2 opts (Single | 2 on 1); cutout N/Y + count select (dplHCCutOutNum); hold downs N/Y/M (cmbHCHoldDownBracket); poles HCTiltType ''/Wand/PoleAtt
- **CLTDBU (Cordless TDBU)**: shade type 1 opt (Single); cutout hidden
- **CLDAYNIGHT (Cordless Day & Night)**: + dual fabric/color selects (cmbDayNightFabric/cmbDayNightColor + cmbFabricb/cmbDayNightColorb); shade-type hidden
- **CORDLOOP (Cord Loop)**: + chain position HCLiftPos, chain length HCliftLenType Standard/Custom; poles hidden; cutout available; shade types Single | 2 on 1
- **SRCORDLOOP (SmartRelease)**: same reveal family as Cord Loop
- **MOTOR (Motorized)**: HCLiftPos 3 opts; + dplMotorType, clip Y/N (cmbHCisClip), remote qty (txtHCRemoteQty); shade type Single
- **MTDAYNIGHT (Motorized Day & Night)**: + dual fabric/color; motor list 6 opts
- **SMARTFIT**: hides shade type / lift pos / motor / hold downs; + mounting plate Y/N (cmbMountingPlate); poles shown
- **Decoflex sizes add**: cmbFrame1, cmbColor1 (43 opts), cmbFrameQty1 (3), RadPreDrill1 Y/N

## Motor lists per OS (dplMotorType1)

- **MOTOR (Motorized)** — Norman Smart: Rechargeable Battery with Wireless Charging Wand | Rechargeable Battery with Wired Charging Wand | AC Adapter Plug-In | DC Low Voltage Hard Wire; Economy: AutoWand; Other: Automate Home Battery Pack | Automate Home AC Adapter
- **MTTDBU (Motorized TD)** — Automate only (Battery Pack | AC Adapter)
- **MTTDBU2 (Motorized TDBU)** — Norman Smart only (4 power sources, no AutoWand)
- **MTDAYNIGHT (Motorized Day & Night)** — Norman Smart 4 (+ additional entries; the 805 builder offers the 4 Norman Smart sources)

## Other fields

- WindowType1 radio (Single)
- Rail Color dplHRFinish1 (19): Default | Agave | Bianca | Black Ink | Celery | Chocolate | Cottage White | Cream | Ginger Spice | Gray Cloud | Indigo | Nature | Plum Purple | Sahara | Sand | Silver | Sky | Terra | White
- Shims Qty*, Special Instructions, live Base Price / Surcharge / Subtotal columns, Mount I/O
- Hold downs (cmbHCHoldDownBracket): N / Y (standard) / M (magnetic; outside mount)

## Fabric availability per shade size

See `src/lib/quote/norman-honeycomb-dealer-fabrics.generated.ts` (913 rows; fabric label,
Norman cloth code, color code, display name per size). "Decoflex for skylights" carries the
same fabric set as "Decoflex". Fabric labels marked `*` on the dealer form carry the 20%
fabric surcharge family (Room Darkening | Sheer | Solus | FR Essentials) and are emitted with
`surcharged: true`.

Summary per size (dealer fabric labels):

- **3/8" Single Cell**: Designer Fabric (LF), Flame Resistant (LF), Flame Resistant (RD)*, FR Essentials*, Light Filtering, Room Darkening*, Sheer*
- **9/16" Single Cell**: Light Filtering, Room Darkening* only
- **3/4" Single Cell**: 3/4" Single Cell Sheer*, Designer Fabric (LF/RD*), Designer Fabric Ashton (LF/RD*), Flame Resistant (LF/RD*), FR Essentials*, Light Filtering, Room Darkening*, Solus*, Woven Breeze, Woven Windsong
- **1 1/4" Single Cell**: same as 3/4" single minus the Flame Resistant lines
- **1/2" Double Cell**: Light Filtering, Room Darkening* only
- **3/4" Double Cell**: Light Filtering, Room Darkening* only
- **Decoflex (SmartFit with Frame)** and **Decoflex for skylights (SmartFit Sloped with Frame)**: Designer Fabric (LF), Flame Resistant (LF/RD*), FR Essentials*, Light Filtering, Room Darkening*, Sheer*

---

# July 2026 retail guide pricing sync (audited 2026-07-01)

Grid audit vs `HONEYCOMB_PRICING` in `src/mts-quote/lib/pricingData.ts` (the catalog JSON
`src/lib/quote/catalog/norman-2026.catalog.json` already matched everywhere):

| Grid key | Pre-sync state | Action |
|---|---|---|
| nine_16_cordless_single | match | none |
| three_8_single_and_3_4_single | match | none |
| half_cordless_double | match | none |
| general_3_4_double | match | none |
| flame_resistant_3_8_single | wrong — was a copy of the first 11 rows of the 3/8" single grid | replaced with the guide grid (13×13, heights to 120") |
| three_4_single_woven_group1 | wrong — heights stopped at 86", all cells low | replaced with the guide grid (13×11) |
| three_4_single_woven_group2 | wrong — heights stopped at 86", all cells low | replaced with the guide grid (13×11) |
| vertical_3_4_and_1_1_4_single | missing | added as `VERTICAL_HONEYCOMB_PRICING.vertical_3_4_single` |
| vertical_flame_resistant | missing | added as `VERTICAL_HONEYCOMB_PRICING.vertical_flame_resistant` |

Surcharges (`HONEYCOMB_SURCHARGES`, all values updated to the guide):

| Guide item | Value | Builder entry name (kept for saved-quote lookups) |
|---|---|---|
| Shim | $7 | Shim |
| Side mount bracket (per shade) | $23 | Side Mount Bracket |
| Light Guard \| Pole Attachment only | $45 | Light Guard - Pole Attachment Only |
| Magnetic hold down (per shade) | $28 | Magnetic Hold Down |
| Cut-out \| Cordless operating pole | $89 | Cut-out Cordless Operating Pole |
| Specialty shapes | $117 | Specialty Shapes |
| SmartFit | $89 | SmartFit |
| SmartFit with Frame | $293 | SmartFit with Frame |
| SmartFit Dual Shade | $178 | SmartFit Dual Shade |
| SmartFit Dual Shade with frame | $382 | SmartFit Dual Shade with Frame |
| Continuous cord loop | $73 | Continuous Cord Loop |
| SmartRelease | $89 | SmartRelease |
| TDBU \| TD | $89 | TDBU (Top Down Bottom Up) |
| Room darkening \| Sheer, Solus \| FR Essentials fabric | 20% of single-shade price | Room Darkening \| Sheer \| Solus \| FR Essentials Fabric (percentage) |
| Day & Night systems | priced as 2 shades | Day & Night (priced as 2 shades) (100% percentage) |

Removed with the sync: the five fixed-$20 fabric surcharges (Room Darkening / Sheer / Solus /
FR Essentials / Blackout "Fabric Surcharge" entries — superseded by the 20% entry), the
`LightGuard 360` $364 entry (a Roller-page item; the honeycomb page only lists the pole
attachment light guard), and the pricing engine's built-in fixed-$20 fabric adjustment for
honeycomb (which would have double-charged next to the 20% automatic surcharge).

Vertical honeycomb surcharges (guide p14: Shim $7; RD | Sheer | FR Essentials 20%) are carried
by the catalog JSON's `vertical_honeycomb` product; no dedicated builder product exists yet.
