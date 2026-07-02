# Norman Roman Shades order form — complete option & cascade map

Captured 2026-07-01 from the live Norman dealer portal (OrderRM.asp, account RA00743) by
(1) dumping every form field from the logged-in page, (2) toggling every selection live and
diffing the form state, and (3) statically decoding `RomanShades.js` (168KB). This is the
source of truth for making the 805 CRM quote builder's Roman Shades flow mirror Norman's
ordering flow, so reps capture every detail Norman will ask for — in the same dependency order.

**805 builder mapping decisions (2026-07-01):**
- Rep-facing fields live in the CRM quote builder (`src/mts-quote/components/crm/quote-builder/DesignCard.tsx`, Roman Shades case) with constants in `src/mts-quote/lib/quoteConstants.ts`.
- Norman's *destructive resets* (changing Shade Type / Valance wipes the chosen style + fabric) are replaced by *validity-based clearing*: we only clear a dependent field when its current value becomes invalid for the new selection.
- Norman bugs/dead code deliberately NOT ported: hidden-mirror length field (`PdLeng12`), dead `CheckSqMt` 40/68 sqft caps (live caps are server data), disabled light-guard color row (805 sells light guards as add-on chips instead), inert `cmbRtnType12`.
- Size min/max/sqft validation is server-side data at Norman (AJAX `RLBL_PdSizeRange`) — NOT replicated; the 805 pricing grid remains the sizing authority. Fabric max-width/seam/railroad rules are documented below (§2.3 of cascade map) but not enforced in v1.
- Banding colors (Edge/Ribbon Banded styles) are fabric-dependent AJAX lists at Norman — captured as a note field requirement, not a fixed list, in v1.
- Pricing: motor/remote/hub attach via existing `MOTORIZATION_OPTIONS` name lookup; Magnetic Hold Down ($27), Room Darkening/Blackout liner ($20), Shim ($6) auto/manual surcharges from `ROMAN_SURCHARGES`. Fold-style upcharges (Edge Banded / Ribbon Banded / Soft Fold) and fabric valance pricing are marked `*` but UNPRICED pending owner numbers — same open-decision pattern as docs/quote-builder audit follow-ups.

---
# Norman Roman Shades — LIVE cascade verification (clicked on the real form, 2026-07-01)

All verified by toggling the real logged-in form and diffing field visibility/checked/option-count state.

## Control Type (dplCordType) — Single shade
- **Cordless** → HIDES chain type, chain color, chain location (LiftPos), chain length; SHOWS "Poles*" row (optTiltType: none / Wand / PoleAtt + dplCordlessTiltType 36"/60", txtWandQty)
- **Continuous Cord Loop (CORDLOOP)** → SHOWS Chain Type (CT001 Standard plastic / CT002 Stainless), chain color dplLadderColor [White|Cottage White|Black] (shown with plastic chain), Chain Location LiftPos [L|R], Chain Length liftLenType Standard/Custom (custom: LiftLength1/2; preset dplLiftLength 16/24/36/48/60/84")
- **Motorized (Motor)** → HIDES all chain rows; SHOWS Power Source (dplMotorType), Remote Qty, remote channels (chkCH), motor-side LiftPosm [L|R]
- **SmartRelease (SRCordloop)** → same reveal set as Cord Loop (chain type/color/location/length)

## Shade Type (BlindNum)
- **1 = Single** (default): standard 4 control types; Shade Style 5 options; full 31 fabric collections
- **5 = Day & Night** → control-type radios SWAP to D&N variants (CLDayNight/LPDayNight/MTDayNight/SRDayNight — same 4 choices, dual-shade codes); previously selected control resets (chain rows hide until re-pick); Shade Style list 6→4 options; ADDS "Back Shade Fabric" (dplPattern22, 64 roller-screen patterns + dplColor2 AJAX colors + chkFabricAllowjoin2) and "Back Shade Hem Bar" (Hamber: standard / HB005); front fabric color resets
- **4 = Common Valance** (2 shades, one headrail) → SHOWS per-panel size grid (CLeft/CRight width+length, GapWidth, dplHeadrailNum [2]); FORCES Valance=Yes (IsValanceType=RM01 auto-checked) and Valance Returns default flips to Wrapped; fabric collections filtered 31→23; control types = standard 4

## Mount Type
- **Inside (I)** default: Palladian Shelf rows visible; valance returns choices: No Return / Wrapped
- **Outside (O)** → HIDES Palladian Shelf entirely; valance returns become Pleated (No Return/Wrapped hidden); SHOWS "Shims*" qty (txtExtensionQty); SHOWS Magnetic hold-down option (HoldDownBracket=M becomes visible)

## Valance (IsValanceType None/RM01)
- Yes (RM01) → reveals Valance Returns radios (inside: No Return*/Wrapped; outside: Pleated) — return depth fields ValDep1/2 + cmbReturn are tied to return type
- Common Valance shade type forces Yes

## Hold Down Brackets (HoldDownBracket)
- N* / Y (standard hold-down; visibility conditional) / M (Magnetic — outside mount) → M reveals dpMagneticColor (14 colors)

## Shade Style (dplSlats) → filters Fabric collections (VERIFIED lists)
- Flat Fold without Seams → 22: Alma|Ashley|Belgian Linen|Blake|Breeze|Caroline|Ella|Ellie|Francis|Impressions|Lakeside|Lorraine|Louise|Patterns|Seabreeze|Sheer Elegance|Sierra|Solids|Taylor|Valencia|Whispering Willow|Windsor
- Flat Fold with Batten Back → all 31: adds Bali|Bora Bora|Catalina|Java|Phuket|Riviera|Rochelle|Scarlett|Sumatra
- Edge Banded* → ONLY: Alma|Francis|Lakeside
- Ribbon Banded* → ONLY: Alma|Ella|Francis|Taylor
- Soft Fold* → 21: (Flat-without-seams list minus Sheer Elegance... verified: Alma|Ashley|Belgian Linen|Blake|Breeze|Caroline|Ella|Ellie|Francis|Impressions|Lorraine|Louise|Patterns|Rochelle|Seabreeze|Sierra|Solids|Taylor|Valencia|Whispering Willow|Windsor)

## Power Source (dplMotorType) accessory matrix (Motorized)
Groups: "Norman Smart: Best Value" (MT025 Rechargeable Battery w/ AC Adapter Charger; MT030 DC Low Voltage Hard Wire; MT031 AC Adapter Plug-In), "Economy" (MT026 AutoWand), "Other" (MT023 Automate Home Li-Ion ARC; MT028 Automate 12V Low Voltage DC)
- MT025 Rechargeable → Remote option RT007/RT017, ShadeAuto Hub qty, Additional Charging Kit qty, Repeater qty*, Power Location (ExtensionCable 0/79)
- MT030 DC Hard Wire → DC Power Distribution Panel qty, DC Harness qty (drops charging kit / power location)
- MT031 AC Plug-In → Power Location (0/79); no DC panel
- MT026 AutoWand → NO remote/channels/hub; Charging Kit qty, Ext Cable qty + color [White|Black], Wand Length (mdplLiftLength 8-72"), Wand Color (dplAdapterColor)
- MT023 Automate ARC → Remote qty + channels, Wall Switch qty + switch channels (chkSWCH), Hub qty, Solar Panel qty*, Repeater qty
- MT028 Automate 12V → DC Panel qty, DC Harness qty, External Battery Pack qty
- Remote model: RT007 (std) vs RT017 → RT017 adds "Remote Color Ring Set Quantity"; 5 channel checkboxes visible per remote
- Wall-switch cross-line matching: dplMotorizedShade ("Will be operated by the remote on another line item" / "Does not need a remote") + dplMatchMotoTypeLine; same pattern for wall switch (dplSWitchShade/dplMatchSwitchMotoTypeLine)

## Fabric → Color (AJAX, verified)
- Collection pick (e.g. Alma) populates dplClothColor: "F1621 Dusk Blue|F1622 Coronet Blue|F1623 Dark Shadow|F1624 Paloma|F1625 Cloudburst|F1626 Whitecap Gray|F1627 Doeskin|F1628 Whisper White|F1629 Chalk White|F1631 Plum" — same F-code format as repo's norman-product-colors.generated.ts

## Misc labels (hidden rows → what the UI calls them)
- dplMotorType = "Power Source"; optTiltType = "Poles*"; Hamber = "Back Shade Hem Bar"; dplPattern22 = "Back Shade Fabric"; txtExtensionQty = "Shims*" (outside mount); ExtensionCable = "Power Location"; mdplLiftLength/dplAdapterColor = "Wand Length"/"Wand Color"; dplLightGuardColor = "Light Guard*"; cmbLadderType/dplLadDecoTape = "Ribbon Banding*"; dplEdgeBand = "Edge Banding*"
- "Side by Side" window type radio never became visible in tested states (single/D&N/common-valance × control types) — check static JS for its trigger
- Surcharge (*) items observed: Edge Banded, Ribbon Banded, Soft Fold styles; Day & Night, Common Valance shade types; Motorized, SmartRelease controls; valance Yes; Blackout lining; Repeater, Solar Panel, Shims, Poles, Light Guard, Charging Wand, Extension Pole, Hub (ShadeAuto Hub Quantity*), Wall Switch


---

# Norman Roman Shades order form — client-side cascade map

Source: `RomanShades.js` (3,974 lines) + helpers (`Validating.js`, `commonfunction.js`). All line numbers refer to `RomanShades.js` unless noted. Only the Roman Shades path (`pgmCode=RM`) is documented; other-product branches (pillow covers, fabric-by-the-yard, parts) are noted only where they share functions.

Key value vocabulary:
- **Shade Type** `BlindNum`: `1` = Single, `5` = Day & Night (dual front/back), `4` = Common Valance (2–4 shades under one valance).
- **Control Type** `dplCordType` (radios `optCordless/optCordloop/optMotor/optSRCordloop` and D&N variants `optCLDayNight/optLPDayNight/optMTDayNight/optSRDayNight`): values `Cordless`, `CORDLOOP`, `Motor`, `SRCordloop`, `CLDayNight`, `LPDayNight`, `MTDayNight`, `SRDayNight`.
- **Shade Style** `dplSlats`: `RM001` Flat Fold without Seams, `RM002` Flat Fold w/ Batten Back, `RM003` (base), `RM003E` Edge Banded, `RM003R` Ribbon Banded, `RM004` Soft Fold. (Legacy `3I…` codes are normalized to `RM…` before use, e.g. line 244, 334.)
- **Motor codes** (`dplMotorType`) as branched in code (labels inferred from `lblMotorName`/`lblHubQty` handling and the live option list):
  - `MT018/MT019` — Norman Smart rechargeable (charging-wand charged); "Power Location" label.
  - `MT020/MT024` — Norman Smart AC Adapter Plug-In (adapter color); "Power Location".
  - `MT025` — Norman Smart Rechargeable Battery w/ AC Adapter Charger (charging kit); "Power Location".
  - `MT030/MT031` — newer Norman Smart variants (Canada; hub recommendation, CARM warnings); "Power Location".
  - `MT026` — AutoWand (economy); "Control Location"; wand length + wand color + extension cable.
  - `MT016/MT023/MT027/MT028` — Automate Home motors (`MT016/MT027` are the B-account variants of `MT023/MT028`, see GetMotorTypeList); wall-switch capable; "Motor Location"; "Wi-Fi Hub with Home Kit".
  - `MT012/MT013` — DC low-voltage hardwire (power-cord length via `dplTiltType`).
  - `MT005/MT010` — legacy motors, no remote/channel UI.
- Fabric color options carry `title="MaxWidth|Openness|Joinable|ClothCode"` (CallAjax `dplClothColor` case, line 155); `titleArry()` (212) splits it. `Joinable` = `Y` (seamable), `R` (railroad-only), `N` (neither).
- Helper `ConvertSize(whole, fraction)` (commonfunction.js 415) = whole + fractional-eighths dropdown.

---

## 1. Trigger → effect map

### 1.1 Shade Type — `BlindNum` radios → `ShadeTypeChange()` (line 754)

Unconditional on every change:
- `dplSlats` reset to blank (selectedIndex 0) — **changing shade type wipes the chosen style**.
- HIDE: `Tr2on1`, `CordTypeSingle`, `CordTypeDual`, `trPattern2` (back-shade fabric), `trLightGuardColor`, `trHeadrail`.
- ENABLE: `PdWidth1`, `PdLeng1`, `cmbwidth`, `cmbLeng`.

**BlindNum = 1 (Single) or 4 (Common Valance)** (769–808):
- SHOW `optCordless` + the single-shade control row `CordTypeSingle`.
- RESET: `dplPattern22` (index 0), `dplPattern2`, `dplColor2`, `dplLightGuardColor`; uncheck all four D&N control radios (`optCLDayNight/optLPDayNight/optMTDayNight/optSRDayNight`).
- RELABEL `lblFabricLeft` = "Fabric"; uncheck `isEqualWidth` → `changeEqualWidth()` (431) re-enables `HCLeftWidth*/HCRightWidth*`.
- **BlindNum = 4 additionally** (786–804): SHOW `trHeadrail` (headrail-count select); DISABLE and CLEAR `PdWidth1/PdLeng1/cmbwidth/cmbLeng` (overall size comes from per-panel fields); run `changeHeadRailNum()`; RELABEL channels: `lblChannel1`="Left Shade Channel", `lblChannel2`="Right Shade Channel", `lblSWChannel1`="Left Switch Channel", `lblSWChannel2`="Right Switch Channel".
- Canada accounts (`hidisCan=Y`): auto-check `optCordless` (805–807).

**BlindNum = 5 (Day & Night)** (809–831):
- Uncheck all four single control radios (`optCordless/optCordloop/optMotor/optSRCordloop`).
- SHOW `CordTypeDual` (the D&N control-type radio row) and `trPattern2` (back-shade fabric + `dplColor2`); `trLightGuardColor` stays hidden (817 — light-guard UI is disabled in this build, see §5 note).
- RELABEL: `lblFabricLeft`="Front Shade Fabric", `lblFabric`="Back Shade Fabric", `lblChannel1/2`="Front/Back Shade Channel", `lblSWChannel1/2`="Front/Back Shade Switch Channel".
- Canada: auto-check `optCLDayNight` (828–830).

Tail calls (832–835): `CheckIsCert()` (3387: if hidden `hidIsCert="N"`, DISABLE + uncheck `optSRCordloop` and `optSRDayNight` — SmartRelease requires certification), `LiftPosCtrl()` (3621), `CordTypeChange()` (469), `changeHamberRail()` (2508).

Related shade-type effects living elsewhere:
- `GetSlatRs()` (3689): Single → AJAX `getSlats` repopulates `dplSlats` (full list incl. Edge/Ribbon Banded); BlindNum 5 or 4 → REMOVE options `RM003R` and `RM003E` from `dplSlats` (Ribbon/Edge Banded unavailable for D&N and Common Valance).
- `SetValanceType()` (2357): BlindNum4 → FORCE `IsValanceTypeY` checked, DISABLE `IsValanceTypeN` (Common Valance must have a valance); else re-enable. Then `ChangeValance()`.
- Fabric-collection filter in `CallAjax("dplClothtype11")` (54–112): BlindNum4 → drop **Bali, Scarlett**; BlindNum5 + non-"B" account (`txtbusiness_type≠B`) → drop **Daphne LF / Daphne RD**.
- `changeHamberRail()` (2508): BlindNum5 → SHOW `HamberTr` (hember-rail radios, `Hamber=""`/`HB005`); otherwise HIDE and force `Hamber1` checked.
- `LiftPosCtrl()` (3621): BlindNum≠4 → show single `tdLeftRightPos`; BlindNum4 → show per-panel lift-pos cells by headrail count and RESET defaults: `LeftLiftPos="R"`, `RightLiftPos="L"`, `RightLiftPos1="R"`; 3+ rails: `CenterLiftPos="R"`; 4 rails: `CenterLiftPosB="R"`.
- `GetRibbonColor()` (2449): BlindNum 5 or 4 (or style `RM003`) → CLEAR `dplLadDecoTape`, `dplEdgeBand`, `cmbLadderType` and HIDE `trRibbon`/`trEdgeBand`.
- `check_Info` guard (1603–1614): Side-by-Side (or `matchLineItem` set) with BlindNum5/4 → blocked with alert.

### 1.2 Control Type — `dplCordType` radios → `CordTypeChange()` (line 469)

First, HIDE everything motor/tilt related (471–491): `trMotorized1,2,3,4,5,7,33,34,35,36,39,40,41,4SW`, `trTiltType`, `ControlLocationLengthTr1`, `trMotorized6`, `trMotorColorRingQty`, `trMotorAdapterColor`. At the end (632) also `trMotorized381`.

**Cord-loop family — `CORDLOOP`, `SRCordloop`, `LPDayNight`, `SRDayNight`** (494–542):
- SHOW `ControlLocationTr` (chain controls) and `trChainType` (Chain Type radios + ladder color).
- Loop types (`CORDLOOP`/`SRCordloop`): default `LiftPos="R"`.
- Force `liftLenType1` (Standard chain length) checked.
- RESET all motorization fields: `dplMotorType`, `txtRemoteQty`, `txtSWitchQty`, `txtACQty`, `txtColorRingQty`, `dplMatchMotoTypeLine`, `dplMatchSwitchMotoTypeLine`, `txtBatteryWQty`, `dplTiltType`, `txtChargingKitQty`, `txtHubQty`, `txtSolar_Panel_qty`, `txtDCPanelQty`, `txtDCHarnessQty`, `txtRepeaterQty`, `dplAdapterColor`; re-check `ExtensionCable1` (the "0"/none option).
- BlindNum4 + not SRDayNight (527–532): FORCE `LeftLiftPos="L"`, `RightLiftPos1="R"`, both DISABLED.
- Inside Mount + (`CORDLOOP` or `LPDayNight`) (533–540): HIDE `spanliftLenType2` (Custom chain-length choice) and force Standard; otherwise SHOW it. (Same rule re-applied in `IsBracketControl()` 3674–3686.)

**All other types** (543–615): HIDE `trChainType`, `ControlLocationTr`; CLEAR `LiftPos`, `RightLiftPos`, `LiftLength1/2`; uncheck both `liftLenType` radios.
- **`Cordless` / `CLDayNight`** (552–577): RESET the same motorization field list; SHOW `trTiltType` (cordless pole/wand options `optTiltType1/2/3`).
- **`Motor` / `MTDayNight`** (578–615): SHOW `trMotorized3` (remote qty), `trMotorized1` (motor/power location `LiftPosm`), `trMotorized4` (channel checkboxes), `ControlLocationLengthTr1`. `Motor` → default `LiftPosm="R"`.
  - If current motor is Automate (`MT016/MT023/MT028/MT027`) (592–607): SHOW `spanCH`, `spanCH2`, `trMotorized33` (wall-switch qty), `trMotorized4SW` (switch channels), `trMotorized34` (hub qty), `trMotorized39` (repeater qty); `MT016/MT023` also `trMotorized35` (charging kit) + `trMotorized36` (solar panel); `MT028/MT027(/MT030)` → `trMotorized40` + `trMotorized41` (DC panel / DC harness qty).
  - Else `MT025/MT026` → SHOW `trMotorized35`; HIDE `trMotorized33`, `trMotorized4SW` (608–614).

Tail calls (618–621): `IsDispLadderColor()`, `DualOptionSetup(CordType)`, `TiltTypeCtrl()` (resets `optTiltType1` checked + `WandQtyCtrl()`), `changeWindowType()`.

**Popup** (623–630): first time `optCordloop` is checked per session (`txtonemsg2` empty) → modal *"Please consider AutoWand™ as a substitute for continuous cord loop. It is Certified Best for Kids!"*.

`GetCordType()` (1805) cross-filters: for BlindNum 1/4 only the 4 single values are valid; for BlindNum5 only the 4 D&N values — otherwise returns "" (drives the "Please select a control type." required check).

### 1.3 `DualOptionSetup(CordType)` (line 635) — dual-shade labels & lift-position rules

Resets on entry: HIDE `MotorRightLiftPosInfo`, `RightLiftPosInfo`, `ChannelRightLiftPosInfo`, `ChannelRightLiftPosInfoSW`; RELABEL `lblChannel1`="Channel", `lblSWChannel1`="Wall Switch Channel"; clear `lblMotorLiftPos`, `lblLiftPos`.

- Non-motor control → CLEAR all channel checkboxes (`chkCH`, `chkCH2`, `chkSWCH`, `chkSWCH2`) (646–650). `Motor` (single/common) → clear only second-shade channels `chkCH2/chkSWCH2` unless BlindNum4 (651–656).
- MotorType `""`/`MT018`/`MT019` → ENABLE `LiftPosm`, `RightLiftPosm`, `LiftPos`, `RightLiftPos` (658–662). `MT025`/`MT026` non-D&N → `LiftPosm="R"` (663–665).
- **BlindNum5** (667–707):
  - D&N control selected (`SRDayNight/MTDayNight/LPDayNight`) → ENABLE all four lift-pos selects; otherwise DISABLE them.
  - `SRDayNight/LPDayNight`: auto-correct — if front/back chain positions empty or both "L" → `LiftPos="R"`, `RightLiftPos="L"` (680–683). `MTDayNight`: `LiftPosm="R"`, `RightLiftPosm="L"` (684–688).
  - `MTDayNight` labels: `lblMotorLiftPos`="Front Shade:", `lblMotorLiftPosR`="Back Shade:", `lblChannel1`="Front Shade Channel"; SHOW `MotorRightLiftPosInfo` + `ChannelRightLiftPosInfo` (+`ChannelRightLiftPosInfoSW` if Automate motor); `lblSWChannel1/2`="Front/Back Shade Switch Channel" (690–701).
  - `LPDayNight/SRDayNight`: `lblLiftPos`="&nbsp;Front"; SHOW `RightLiftPosInfo` (703–706).
- **BlindNum4 + Motor** (708–728): SHOW `MotorRightLiftPosInfo`, `ChannelRightLiftPosInfo`, `ChannelRightLiftPosInfoSW`; labels Left/Right Shade Channel + Left/Right Switch Channel, `lblMotorLiftPos`="Left Shade:", `lblMotorLiftPosR`="Right Shade:". Norman Smart motors (`MT025/MT020/MT024/MT030/MT031/MT026`) → FORCE `LiftPosm="L"`, `RightLiftPosm="R"`, both DISABLED; other motors → both default "R" (enabled).
- **Motor/MTDayNight + `MT026` (AutoWand)** (730–740): HIDE `trMotorized3` (remote qty), `trMotorized4` (channels), `ChannelRightLiftPosInfo`; SHOW `trMotorized7` (AutoWand row). Otherwise BlindNum4/5 → SHOW `ChannelRightLiftPosInfo`.
- `LiftPosmChangeDayNight(obj)` (3823): for D&N, changing either front/back position select auto-flips the other to the opposite side (L↔R).

### 1.4 Window Type — `WindowType` radios → `changeWindowType()` (line 2332)

- **Single** (`WindowType1`): HIDE `trmatchLineItem`; CLEAR `matchLineItem`; ENABLE `BlindNum5`, `BlindNum4`.
- **Side by Side** (`WindowType2`): SHOW `trmatchLineItem` ("match with line item" select); DISABLE `BlindNum5` and `BlindNum4`; if either was checked → FORCE `BlindNum1` and run `ShadeTypeChange()` (full cascade above).
- Validation tie-ins: `ChecktMatchWindowType()` (3315) posts the full config to the server on submit; mismatch → alert *"This shade cannot be matched to line item #N because they do not have the same: …"*; already-matched → *"The other item match …"*. Client-side (3344): Side-by-Side blocked for `RM001`, `RM003E`, `RM003R` styles — *"Side by Side is not available for Flat Fold without Seams, Ribbon Banded, and Edge Banded shades."*

### 1.5 Mount Type — `MountType` radios (I/O)

Handlers (wired from HTML): `shwCordlessSize()` (1748), `PalladianShelfShow()` (1762), `IsBracketControl()` (3653), `ChangeValance()` (2369), `changReturnValue()` (2291), plus size math everywhere (IB width deduction 0.375").

- `shwCordlessSize` (1748): RELABEL `lblshwCordlessSize` max-width note = **96.375"** (Inside) / **96"** (Outside); then `changeClothColor('lblFabricWidth1','roman')` and `PalladianShelfShow()`.
- `PalladianShelfShow` (1762): **Outside** → HIDE `trPalladianShelf` and CLEAR `dplPSColor/PSDepth1/cmbdept/dplPSWidthType`; SHOW `trExtensionQty` (light-guard/extension qty) — except BlindNum5 where it is hidden+cleared (1782–1791). **Inside** → SHOW `trPalladianShelf`; HIDE `trExtensionQty` + CLEAR `txtExtensionQty`. Then `PSWidthChange()`.
- `IsBracketControl` (3653): **Outside** → SHOW `spanMagnetic` (Hold Down Bracket radios); if `HoldDownBracket3` (Magnetic) checked → SHOW `spanMagneticColor`, hide the "no-bracket" note; else clear `dpMagneticColor` + show note. **Inside** → FORCE `HoldDownBracket1` (None) checked, CLEAR `dpMagneticColor`, hide note. Also re-applies the IB+cordloop custom-chain-length hide (3675–3686) and calls `changeLiftLenType()`.
- `ChangeValance` (see §1.6) — return-type radio sets differ by mount.
- Mount also changes: fabric usable width (+0.375 IB, `GetFabric1MaxWidth` 1852), custom chain max (length−2 IB, check_Info 924), IB sqft width deduction (0.375; 0.1875/panel for common valance — 1736–1741), custom return option list (`changReturnValue`).

### 1.6 Valance — `IsValanceType` radios → `SetValanceType()` (2357) / `ChangeValance()` (2369)

`SetValanceType`: BlindNum4 → force Yes + disable No (see §1.1); then `ChangeValance`.

`ChangeValance` (2369):
- **RESET `dplSlats` to blank (2372)** — changing valance wipes the shade style.
- Uncheck ALL return radios `cmbRtnType1/2/3/11`; HIDE `spanIBReturn`, `spanOBReturn`; SHOW `spanIBNoteReturn`.
- **Inside mount**: SHOW `spanIBReturn` (No Return / Wrapped choices). If Valance=None → auto-check `cmbRtnType2` (No Return) and hide the note.
- **Outside mount**: Valance=None → auto-check `cmbRtnType2` and SHOW `spanIBReturn`; Valance=Yes → SHOW `spanOBReturn` (Wrapped / Pleated / Wrapped-2nd choices).
- Fabric `Valencia` selected → re-run `changePattern1()` (color list refresh) (2403–2405); `IsLockLining()`.
- Outside mount: BlindNum5 → hide+clear `trExtensionQty`, else show (2408–2417).
- Re-applies the BlindNum4 force-Yes rule (2418–2425).

### 1.7 Valance Return — `cmbRtnType` radios / `cmbReturn` / `ValDep`

- `changReturnValue()` (2291): SHOW `spanReturnInfo` and rebuild `cmbReturn`: only when the checked return radio's value is `"Traditional"` (the wrapped/traditional return; other values → hide `spanReturnInfo`, clear list, `changeReturnItem()`):
  - Cordless OR width ≤ 42" (IB width already −0.375): options **2 1/2"** and **Other (Custom)**; OB defaults to 2 1/2".
  - Width > 42": options **3 1/2"** and **Other (Custom)**; OB defaults to 3 1/2".
- `changeReturnItem()` (2281): `cmbReturn == "Custom"` → SHOW `ReturnSizeInfo` (`ValDep1`+`ValDep2` custom depth); else CLEAR both and HIDE.
- **Pleated return (`cmbRtnType3`) side effects** on fabric list (CallAjax 75–95): drops textured collections **Bora Bora, Catalina, Java, Riviera, Sumatra, Phuket** and additionally **Bali, Scarlett, Breeze, Sierra**; Caroline substitutes ClothCode `AA0206` (changePattern1 338–344).
- `cmbRtnType12` (in the field inventory) is never referenced in RomanShades.js — server-rendered/inert for RM.

### 1.8 Shade Style — `dplSlats`

- `showRomanImg(2)` (1996–2007): swaps style image; `RM001` → SHOW `spanRM001notice`, else hide.
- `GetClothtype()` (2266): AJAX `GetClothtype&ClothCode={dplSlats}` repopulates `dplClothtype11` (collections), resets it blank, empties `dplClothColor`, calls `FabricAllowjoin1` + `GetRibbonColor`.
- Fabric list filter: styles `RM001`/`RM004` drop **Bora Bora, Catalina, Java, Riviera, Sumatra, Phuket** (CallAjax 97–101); Caroline → ClothCode `AA0206` (changePattern1 354–358).
- `GetRibbonColor()` (2449):
  - `RM003R` + cloth `AA0305/AA0355/AA0369/AB0203` → SHOW `trRibbon`; AJAX `RibbonColor` (PLadderType=`RBR`) → `dplLadDecoTape`.
  - `RM003E` + cloth `AA0210/AA0355/AA0369` → SHOW `trEdgeBand`; AJAX `RibbonColor` → `dplEdgeBand`.
  - Anything else (incl. BlindNum4/5, plain `RM003`) → hide both rows, clear `cmbLadderType`, `dplLadDecoTape`, `dplEdgeBand`.
- Style drives fabric max-width deductions (§2) and the size-range AJAX key (`PgmSize`, with `RM003R/E` mapped to `RM003` — CheckWLVal 1652–1655).

### 1.9 Fabric collection — `dplClothtype11` → `changePattern1()` (line 328)

- AJAX `GetClothColor&pgmCode=RM{dplSlats}&ClothCode={dplClothtype}&brand={option title}&ClothDescEn={name}` → repopulates `dplClothColor` (value = ColorCode, text = "code name", title = `MaxWidth|Openness|Joinable|ClothCode`; colors with `EndDate == "4/29/2025"` get a `***` suffix).
- Caroline + (`RM001`/`RM004`/pleated return/BlindNum4) → forces `ClothCode="AA0206"` before the call (338–358).
- On init (`isinit==1`): collections **Sheer Elegance** or **Scarlett** → default `IsLining2` (Blackout) checked; all others → `IsLining1` (Translucent) (372–378).

### 1.10 Fabric color — `dplClothColor`

- `changeClothColor('lblFabricWidth1','roman')` (302): sets the "max width" label from `GetFabric1MaxWidth` and SHOWs `spanmaxwidth`; colors `F1061/F1101/F1080/F1081/F1085/F1084` → SHOW `spanColorView` + `spanColorViewIsDisptitle` (pattern-view links); then `PatternOrientationDisp()`.
- `PatternOrientationDisp()` (3744): ClothCode `AB0635/AB0636/AA0361` → SHOW `divPattern` (Pattern radios ``/`R`); ClothCode `AC0401` → SHOW `divOrientation` (`Orientation` OS/ON radios, i.e. railroading orientation); else hidden.
- `FabricAllowjoin1()` (1858): computes seam/railroad acknowledgement UI — see §2.3.
- `IsLockLining()` (2427): **Valencia + color `F0139` (Natural White)** → uncheck + DISABLE `IsLining2` (Blackout locked out); if Blackout was already checked with that combo → alert *"…Valencia in the color Natural White must be ordered with translucent lining."*
- Popups: `showPopFabrics` (3396): (`AA0216`+`F0248`) or (`AA0212`+`F0244`) → "Pattern Alignment" popup (pattern alignment not guaranteed / not railroaded). `divOrientationOpen` (3437): `F1082/F1083` → "Orientation Notice" dialog (expired 2023-04-30 gate). `showPopFabricsColor` (3455): selected option text ends `***` → SHOW `spanendcolorpop` (discontinued-color note).
- `GetRibbonColor()` re-run (banding colors depend on ClothCode+ColorCode).

### 1.11 Back-shade fabric (Day & Night) — `dplPattern22` → `changePattern2()` (line 381)

- AJAX `GetClothColor` with `brand = title + "Dual"` → repopulates `dplColor2`; updates `lblFabricWidth2` from `GetFabric1MaxWidth("dplColor2")`.
- **Clarissa RD** selected → modal warning: *"Clarissa RD fabric does not provide adequate room darkening… Clarissa Coal F1550 provides the most light blocking properties…"* (390–404).
- `FabricAllowjoin1` handles second-fabric railroad/seam acknowledgement (`spanFabricAllowjoin2`, `chkFabricAllowjoin2`) — §2.3.

### 1.12 Lining — `IsLining` radios

Only interaction is `IsLockLining()` (2427) per §1.10 (Valencia Natural White forces Translucent) and the init defaults in `changePattern1` (§1.9).

### 1.13 Hold Down Bracket — `HoldDownBracket` radios → `ShowspanMagneticColor()` (3730), `IsBracketControl()` (3653)

- Visible only for Outside mount (§1.5). `HoldDownBracket3` (Magnetic) → SHOW `spanMagneticColor` and default `dpMagneticColor="4103"`; otherwise CLEAR color and (OB) show `spanMagneticnonotes`.
- Inside mount → forced to `HoldDownBracket1` (None).

### 1.14 Chain type / chain controls

- `IsDispLadderColor()` (2350): `dplChainType1` (Standard plastic) checked → SHOW `spanLadderColor` (`dplLadderColor` White/Cottage White/Black); stainless → HIDE. Then `changeLiftLenType()`.
- `changeLiftLenType()` (454): `liftLenType2` (Custom) → SHOW `liftLenInfo` (`LiftLength1`+`LiftLength2` custom entry), CLEAR `dplLiftLength`; Standard → HIDE, CLEAR `LiftLength1/2` and `dplLiftLength`.
- IB + `CORDLOOP`/`LPDayNight`: Custom option hidden entirely (§1.2/§1.5).

### 1.15 Common Valance headrails — `dplHeadrailNum` → `changeHeadRailNum()` (line 2516)

- `2`: SHOW rows `trCommonValanceA` + `trCommonValanceD`; HIDE `B`,`C`; label `lblGapWidth`="Gap Width:"; CLEAR all center-shade fields + `RightGapWidth*` + `CenterGapWidth*`; move the gap-width span into the left row (`td4`), hide `spanRightGapWidth`.
- `3`: SHOW `A`,`B`,`D`; HIDE `C`; labels "Left Gap Width:", "Center Shade Width/Length:"; CLEAR center-B + `CenterGapWidth*`.
- `4`: SHOW `A`,`B`,`C`,`D`; labels "Left Gap Width:", "Center Left Shade Width/Length:".
- `LiftPosCtrl()` (3621) sets per-panel control-position defaults (§1.1).
- `CheckHeadRail()` (2581) validates on submit (§2.4). `MaxWidthLength()` (3228) returns [max panel width, max panel length] used as the effective size for all other checks.

### 1.16 Motor type — `dplMotorType` → `GetMotorTypeList()` (2702), `ChangeMotorType()` (2752), `MotorTypePowerCord()` (3133)

**`GetMotorTypeList`** (runs when Motor/MTDayNight selected; depends on BlindNum, MountType, width): AJAX `GetMotorTypeList` → repopulates `dplMotorType`, then account filters:
- non-"B" business type → REMOVE `MT016`, `MT027`; "B" accounts → REMOVE `MT023`, `MT028` (2718–2729).
- Canada (`hidisCan=Y`): REMOVE `MT020`, `MT024`, `MT028`; non-B Canada also removes `MT021`, `MT023` and the "-- Other Options --" header (2730–2748). Then `ChangeMotorType()`.

**`ChangeMotorType`** (2752):
- Reset: HIDE `trMotorized5/7/2`; uncheck `MotoContrlOpt1/2` (remote model radios); HIDE `ChannelRightLiftPosInfo`; CLEAR `txtACQty`, `txtBatteryWQty`; at end CLEAR `txtChargingKitQty`.
- `MT005/MT010` (legacy): HIDE `trMotorized2/3/4`; CLEAR match-lines, remote qty, switch qty, `dplChannelSetting`.
- All other motors: SHOW `trMotorized3` (remote qty), `trMotorized4` (channels), `trMotorized34/35/36`; HIDE `spanPowerCord`, `spanExtensionCable`, `spanCH`, `spanCH2`; CLEAR `txtRemoteQty`, `txtSWitchQty`. Then:
  - `MT018/MT019/MT020/MT024/MT025/MT030/MT031` → SHOW `trMotorized2` (remote type RT007/RT017).
  - `MT012/MT013` → `txtACQty=0`, `txtBatteryWQty=0`.
  - `MT026` (AutoWand) → HIDE `trMotorized3/4`, `ChannelRightLiftPosInfo(SW)`; SHOW `trMotorized7`.
  - `MT020/MT024/MT025/MT031` → SHOW `spanExtensionCable`, default `ExtensionCable1` checked. Others → CLEAR `dplTiltType`, re-check `ExtensionCable1`.
  - Automate `MT016/MT023/MT028/MT027` → SHOW `spanCH`, `spanCH2`, `trMotorized33` (wall switch), `trMotorized4SW`; (+`ChannelRightLiftPosInfoSW` if MTDayNight/BlindNum4). Else hide those.
  - Lift-pos rules: `MT018/MT019` → `LiftPosm="R"` DISABLED; otherwise (non-D&N) enabled, default "R". BlindNum4 + `MT016/MT023/MT028/MT027/MT020/MT024/MT025/MT026/MT030/MT031` → `LiftPosm="L"`, `RightLiftPosm="R"`, both DISABLED. BlindNum5/4: MT026 hides `ChannelRightLiftPosInfo`, others show it.
  - BlindNum1 + `MT025/MT030/MT031/MT026/MT028/MT023` → reset `LiftPosm` selectedIndex 0 (2868–2877).
- Tail: `RemoteQtyChang()`, `changeRemoteType()`.

**`MotorTypePowerCord`** (3133) (also called via `changeRemoteType`):
- HIDE rows `trMotorized34…41`, `trMotorized381`, `trMotorColorRingQty`, `trMotorAdapterColor`, `trMotorized6`.
- `MT018/MT019`: `txtChargingWandQty="1"`; SHOW `trMotorized37` (charging wand qty) + `trMotorized38` (extension pole qty). Others: CLEAR both.
- `MT026`: SHOW `trMotorized381` (extension cable qty row).
- Smart/Automate set (`MT018/19/20/24/25/16/23/28/27/30/31`): SHOW `trMotorized34` (hub qty) + `trMotorized39` (repeater qty); `MT016/MT023` also `trMotorized35` (charging kit) + `36` (solar panel); `MT028/MT027/MT030` → `trMotorized40` + `41` (DC panel/harness), and non-MT030 also `trMotorized6` (external battery pack). RELABEL `lblHubQty`: Norman Smart set → "ShadeAuto Hub Quantity", Automate → "Wi-Fi Hub with Home Kit Quantity". Calls `RemoteTypeOption()`.
- `MT025/MT026` → SHOW `trMotorized35` (charging kit).
- `MT020/MT024/MT026` → SHOW `trMotorAdapterColor`; `FillAdapterColor()` (3870: options White 2058 / Black 2208, + Cottage White 2094 for MT026); label "AC Adapter Color*"; `MT020/MT024/MT025` → preselect Black `2208` (`MT024/MT025` DISABLED); `MT026` → blank, label "Wand Color". Others → CLEAR `dplAdapterColor`.
- Norman Smart set (`MT018/19/20/24/25/30/31`) → CLEAR `txtSWitchQty`, `txtChargingKitQty`, `txtSolar_Panel_qty`, `txtDCPanelQty`, `txtDCHarnessQty`. Non-`MT028/MT027` motors → CLEAR `txtBatteryWQty` (external battery only for MT027/28).
- `PowerCordnote()` (3708): `MT012` → note "25TE is not available"; `MT013` + cord length 86 → "25TE with power cord length 86\" is not available"; charging-wand qty 0/blank → note "at least one charging wand is needed per order."

**`changeRemoteType()`** (2644): HIDE `trMotorColorRingQty`; first time a `MT025/MT030/MT031` motor's remote settings change → popup *"We highly recommend adding a ShadeAuto Hub."*; then `MotorTypePowerCord()`.

**`RemoteTypeOption()`** (3863): `MotoContrlOpt2` (RT017 remote) checked → SHOW `trMotorColorRingQty` (color ring qty); else CLEAR `txtColorRingQty`.

**`MotortypeMsg()`** (3912) — Canada-only compliance popups (once each): `MT021/MT023` non-B → Automate-discontinuation notice ("discontinued January 1st 2025…"); `MT030/MT027` and `MT031/MT016` → CARM cord-safety warning ("Any cord that is reachable and exposed must be secured… 22 cm… 35 N force"); `MT026` with extension cable qty > 0 → same CARM warning.

### 1.17 Remote / wall switch / channels

**`RemoteQtyChang()`** (2991):
- `txtRemoteQty == "0"` → HIDE `trMotorized2` (remote type); SHOW `spanMotorizedShade` (`dplMotorizedShade` select); SHOW `trMatchMotoTypeLine` only if `dplMotorizedShade == "Will be operated by the remote on another line item"`.
- qty ≠ 0 → SHOW `trMotorized2` for `MT018/19/20/24/25/30/31`; HIDE `trMatchMotoTypeLine` and `spanMotorizedShade`.
- Same pattern for `txtSWitchQty`/`dplSWitchShade`/`divMatchSwitchMotoTypeLine`/`spanSWitchShade` (3025–3035).
- Channel enable/disable: RemoteQty "0" + motor set + not "operated by another line" → CLEAR + DISABLE `chkCH/chkCH2`, HIDE `trMotorized4` (+`ChannelRightLiftPosInfo` when not single); otherwise (and motor ≠ MT026) ENABLE + SHOW (3037–3058). Switch channels `chkSWCH/chkSWCH2` enabled only for Automate motors with switch qty ≠ 0 (or 0 + operated-by-other) (3060–3080). Tail: `SWitchQtyChang()`.
- `SWitchQtyChang()` (3083) also RELABELs `lblMotorName`: "Power Location" (Norman Smart set) / "Control Location" (MT026) / "Motor Location" (others).

**`MotorizedShadeChange()`** (2916): `dplMotorizedShade` = "Will be operated by the remote on another line item" → SHOW `trMotorized4` + `trMatchMotoTypeLine` (+`ChannelRightLiftPosInfo` when not single); ENABLE channels. = "Does not need a remote" → HIDE those, CLEAR `dplMatchMotoTypeLine` + all `chkCH/chkCH2`, and popup `popMatchMotoTypemsg()` (2890): *"Please confirm that this shade does not need a remote because the shade will be operated by a remote on a previous WO#."* (+ ShadeAuto one-room note for `MT018/19/25/30/31`).

**`SWitchShadeChange()`** (2956): identical pattern for wall switch (`trMotorized4SW`, `divMatchSwitchMotoTypeLine`, `chkSWCH*`), no popup.

**`RemoteQtyisZero()`/`SWitchQtyisZero()`** (3880/3888): qty typed as "0" → auto-set the corresponding "…Shade" select to "Will be operated by the remote on another line item", clear the match-line select, SHOW the match-line row.

**`getMatchMotoTypeLine()`** (3761): AJAX `GetMotoTypeLine` fills `dplMatchMotoTypeLine` (and `dplMatchSwitchMotoTypeLine` for Automate motors, `flag=SW`); then `RemoteQtyisZero`, `SWitchQtyisZero`, `MotortypeMsg`.

**`checkExtCableColor()`** (3123): `txtExtCableQty` > 0 → SHOW `spanExtCableColor` (`dplExtCableColor` White/Black), else hide.

### 1.18 Cordless pole/wand — `optTiltType` radios → `WandQtyCtrl()` (3259) / `TiltTypeCtrl()` (3274)

- `TiltTypeCtrl` (called whenever control type changes): FORCE `optTiltType1` (none) checked, then `WandQtyCtrl`.
- `WandQtyCtrl`: HIDE `spanWandQty` + `spanTiltTypeLength`; RESET `txtWandQty="1"`, `dplCordlessTiltType=""`. `optTiltType2` (pole) → SHOW `spanWandQty` + `spanTiltTypeLength` (pole length 36"/60"). `optTiltType3` (pole attachment) → SHOW `spanWandQty` only.

### 1.19 Width/Length entry — `PdWidth1/cmbwidth`, `PdLeng1/cmbLeng`

- No live show/hide; sizes feed `changReturnValue` (42" return threshold), `GetMotorTypeList` (width param), `FabricAllowjoin1` (seam/railroad UI), and submit-time `CheckWLVal`/`CheckHeadRail`/`check_Info` (§2, §3).
- `SetupCordType()` (743) fires on size change: **unchecks `chkFabricAllowjoin1`** (forces re-acknowledgement of seam/railroad after any size edit); computes but discards a 96.375 standard width.
- Note: `CheckWLVal` reads current length from `PdLeng12` (1673, 1706) — a hidden mirror field of `PdLeng1` (not the visible input).

### 1.20 Room / misc

- `RoomSel()` (411): `txtroomsel == "Other"` → SHOW free-text `cmbRoom`, hide/clear location description; any non-empty room → SHOW `spanLocdesc` (`txtBlindLoca`).
- `isEqualWidth` (431/439): checked → DISABLE + CLEAR `HCLeftWidth1/2`, `HCRightWidth1/2` (D&N front/back widths follow the main width).
- `PSColorChange` (3844): PS color chosen → SHOW `divPalladianShelf` details. `PSWidthChange` (3850): `dplPSWidthType` = Custom → SHOW `spanPSWidth` + custom-width note; Default → hide + CLEAR `PSWidth1/cmbPSWidth/txtPSQty` + default-width note.
- `showExtensionQtyNote` (3816): `txtExtensionQty` > 0 → SHOW `fontExtensionQty` note.

---

## 2. Size constraints

### 2.1 Overall width/length/area — server-driven (`CheckWLVal`, line 1651)

Primary min/max come from AJAX `RLBL_PdSizeRange` (returns `[minWidth, maxWidth, minLength, maxLength, MaxSQFT]`), keyed by: `pgmCode` (first 2 chars of style), `PgmSize` (style; `RM003R/E` → `RM003`), `PdType=8`, `BlindNum` (1/4/5), `MountType`, `pCompany`, and `ClothCode` = CordType, suffixed `_MT023` or `_{MotorType}` for the listed motor codes (1656–1663). So exact numbers are data, not code; client-side adjustments:

| Rule | Value | Where |
|---|---|---|
| RM001 + ClothCode `AC0401` + Orientation OS + Motor/MTDayNight | maxLength forced to **96.375"** (IB, non-Automate motor) else **96"** | 1681–1686 |
| Fabric not joinable (`Joinable=N`, ≠`AB0103`) and width > fabric width | maxWidth clamped to fabric max width | 1688–1694 |
| Max area | `width × length / 144 ≤ MaxSQFT` (IB width −0.375"; common valance −0.1875"/panel) | 1734–1746 |
| D&N aspect ratio | length/width ≤ **3** (IB width −0.375) — "The maximum width to length ratio is 1:3." | 1710–1720 |
| Lorraine `F0031` + RM001 | width must be ≤ fabric width; error min shown as **20"** (OB) / **20.375"** (IB); seam checkbox force-cleared | 1044–1053, 1929–1932 |

Alert texts: "Please enter the valid width (between X\" and Y\")", "…valid length…", "Please note that the maximum area is N sqft." (1723–1746).

### 2.2 Hardcoded sq-ft caps — `CheckSqMt` (line 838) ⚠ currently dead code

Defined but its call in `check_Info` is commented out (1633–1634); the live cap is the AJAX `MaxSQFT`. Historical values: Cordless **40**, CLDayNight **40**, CORDLOOP/SRCordloop **68**, LPDayNight/SRDayNight **68**, Motor **68**, MTDayNight **68** sq ft. Alert: "Please note that the maximum area is N sqft."

### 2.3 Fabric width / railroading / seams

`GetFabric1MaxWidth(Clothtype)` (1821): start from the color's `MaxWidth` (title[0]), then deduct by style/control:

| Style | Deduction |
|---|---|
| RM001 + CORDLOOP/SRCordloop/Motor/LPDayNight/MTDayNight/SRDayNight | −5.75" |
| RM001 + Cordless | −8.375" |
| RM001 + CLDayNight | −9.125" |
| RM003/RM003E/RM003R + ClothCode `AC0401/AC0402/AB0665/AB0674` | −3.5" |
| RM003/RM003E/RM003R (other cloths) | −1.9375" |
| RM004 | −2.4375" |
| (RM002: no deduction) | 0 |
| Inside mount (all) | **+0.375"** |
| D&N back fabric (`dplColor2`) | raw MaxWidth, no deductions (1833–1835) |

Seam/railroad acknowledgement (`FabricAllowjoin1` 1858 + `check_Info` 1043–1124): when order width > fabric max width:
- `Joinable=N` (and ClothCode ≠ `AB0103`): blocked (width clamped, no checkbox).
- Seam case (`Joinable=Y` and (RM001 with width or length > fabric width, or RM001+`AA0210`, or ClothCode `AB0203`/`AB0702`/`AA0372`)): checkbox value `S`, message "…fabric will be **seamed**…" + seam image link.
- Railroad case (length ≤ fabric width, or `Joinable=R`): checkbox value `R`, "…fabric will be **railroaded**…". Railroaded `F0031` special maxLength: RM001 **45"**, RM002/RM003 **36"**, RM004 **26"** (+0.375 IB except RM003/RM004 F0031) then length must be ≤ that (1073–1091).
- Both width & length exceed: `Joinable=R` → railroad message; else value `Y`, "…**railroaded and seamed**…".
- The `chkFabricAllowjoin1` checkbox is REQUIRED whenever visible (alert variants at 1104–1121); it is force-unchecked on any size change (`SetupCordType` 747) and when width drops back within fabric width (1917–1926).
- Back fabric (`chkFabricAllowjoin2`): width > fabric2 & length ≤ fabric2 → railroad ack required; both exceed → railroad+seam ack required; `Joinable=N` fabric2 (≠`AB0103`) with width > fabric2 → hard block, alert "valid width (between 12\"/12.125\" and F2\")" (1153–1185, 1954–1967).

### 2.4 Common Valance (`CheckHeadRail` 2581, `MaxWidthLength` 3228)

- Every gap (`GapWidth`, `RightGapWidth`, `CenterGapWidth`): **0.125" ≤ gap ≤ 6"** — "A minimum gap of 0.125 and maximum of 6 between Roman Shade is required."
- Total width (all panels + gaps) ≤ **144"** — "…max width for common valance shades is 144\"."
- All panel lengths must be equal (check_Info 963–982).
- Per-panel width/length validated against the AJAX size range (CheckWLVal 1696–1704); IB sqft width deduction 0.1875"/panel.

### 2.5 Chain (lift) length — check_Info 912–934

Custom chain (`liftLenType2`) with no preset chosen: `10" ≤ length ≤ 130"`, except:
- `SRCordloop`/`SRDayNight`: min **12"**.
- Inside mount: max = shade length − 2".
- `CORDLOOP`/`LPDayNight`: min = shade length − 3".
- Alert: "Please enter a valid custom chain length (between X\" and Y\")." Presets `dplLiftLength`: 16/24/36/48/60/84".

### 2.6 Valance returns — check_Info 996–1010

Custom return depth (`cmbReturn=="Custom"`): Cordless or width ≤ 42" → **1"–4.25"** ("between 1\" and 4 1/4\""); width > 42" → **1"–4.875"** ("between 1\" and 4 7/8\"").

### 2.7 Cordless max width label — `shwCordlessSize` (1748)

Pure display: `lblshwCordlessSize` = **96.375"** (Inside) / **96"** (Outside). (The name is misleading; it applies to the mount, not just cordless.)

### 2.8 Palladian Shelf — check_Info 1536–1595

- Depth **2"–4"**; shown only Inside mount.
- Default width: order width (gap-inclusive for BlindNum4) must be ≤ **96"** ("max width for Palladian Shelf is 96\"").
- Custom width: **6"–96"**; `txtPSQty` required, ≤ OrderQty.

---

## 3. Conditional requiredness — `check_Info(theForm, pCompany)` (line 864)

Checks run in order; first failure alerts and aborts. (Abbreviated alert text in quotes.)

**Always:**
1. `OrderQty` ≠ ""/0 — "Please enter a quantity."
2. `LineNote` must be non-Chinese — "…alphanumeric characters only in special instructions."
3. Unless BlindNum4: `PdWidth1` and `PdLeng1` ≠ ""/0 — "Please enter a width/length."
4. Control type selected (`GetCordType()` ≠ "") — "Please select a control type."
5. Valance option selected (`IsValanceTypeN/Y`) — "Please select a valance option."
6. Return option: Valance=Yes → one of `cmbRtnType1/2/3/11`; Valance=No → `cmbRtnType1/2` — "Please select a valance returns option."
7. `dplSlats` ≠ "" — "Please select a shade style."
8. `dplClothtype11` ≠ "" — "Please select a fabric." (BlindNum5 wording: "…for the front shade.")
9. `dplClothColor` ≠ "" — "Please select a color."
10. Lining selected (`IsLining1/2`) — "Please select a lining." Valencia+F0139+Blackout → blocked (translucent required).
11. Channel count per shade ≤ 10 (both channel sets) — "…maximum of 10 channels per shade."
12. Side-by-Side: `matchLineItem` required — "Please select the line item this shade should be matched with."; blocked for D&N ("Side by Side is not available for Day & Night shades."), Common Valance, and styles RM001/RM003E/RM003R; server match check (`ChecktMatchWindowType`).
13. Size range + sqft + fabric width/seam checks (§2).

**If custom chain length (`liftLenType2`):** `LiftLength1` or `dplLiftLength` required — "Please enter a chain length."; range per §2.5.

**If `cmbReturn == "Custom"`:** `ValDep1/2` required — "Please Select \"Please enter the return size\"."; range per §2.6.

**BlindNum4 (Common Valance):** equal panel lengths; `CheckHeadRail()` (§2.4).

**BlindNum5 (Day & Night):**
- `dplPattern22` (back fabric) required — "Please select a fabric for the back shade."
- `dplColor2` required — "Please select a color for the back shade."
- Daphne LF/RD blocked for non-B accounts.
- Back-fabric railroad/seam acks (§2.3).
- Motor: `RightLiftPosm` required — "Please Select \"Motor Control Back\"."; loop types: `RightLiftPos` required — "Please select chain controls Back."
- LP/SRDayNight: front & back chain positions may not match — "Pull Cord Controls directions can not be the same side…"; MTDayNight: same for motor positions.
- Front/back channels may not overlap (smart/Automate motors) — "…front and back shades cannot be assigned to the same channel."

**If Motor / MTDayNight (1250–1460):**
- `dplMotorType` required — "Please select a motor power source."
- `MT018/19/20/24/25/30/31` + remoteQty ≠ "0": remote model radio (`MotoContrlOpt1/2`) required — "Please select a remote type."
- `MT020/MT024`: `dplAdapterColor` required — "Please select a AC adapter color."
- Non-MT026: remote qty or switch qty required — "Please enter a remote quantity or select the line item of the remote…"
- remoteQty "0" + "operated by another line" + no match line → "Please indicate the line item's remote that this shade will be operated by." (same for switch).
- `MT005/10/16/23/27/28`: some control required (remote, switch, or match line) — "Please enter a switch quantity or remote quantity."
- Remote qty blank rules by motor family (1304–1312) — "Please enter a remote quantity…(0 if operated by another line item)."
- Max **2 remotes per shade** (`txtRemoteQty ≤ OrderQty×2`); max **2 controls (switches+remotes) per shade**; max **1 extension pole**, **1 charging wand**, **1 charging kit** (MT025/26) per shade.
- Switch channels set but no switch qty/match → "Please select the line item of the remote…"; switch qty>0 requires switch channel(s) — front/back/left/right variants; channels set with qty blank → "Please clear switch channel."
- Channel required when remote qty > 0 (or 0 + match line): "Please select a channel." / "…for the front shade." / "…channel setting for the left shade."; second channel set required for MTDayNight/BlindNum4 ("…for the back shade." / "…right shade.").
- `LiftPosm` required — wording by motor: Automate "Please select a motor location." / MT026 "…control location." / others "…power location."; `RightLiftPosm` required for BlindNum4/5.
- `MT012/MT013`: `dplTiltType` (power-cord length) required — "Please select a power cord length."
- External battery (`txtBatteryWQty`): must equal exactly **one per motor** (BlindNum5 ×2, BlindNum4 ×headrails, ×OrderQty) — "Please order one external battery pack per motor."; mutually exclusive with DC panel — "Please order one option…DC Power Distribution Panel or External Battery Pack."; DC harness requires DC panel.
- `MT026` (AutoWand): `mdplLiftLength` (wand length) required — "Please select a wand length."; `dplAdapterColor` (wand color) required; ext-cable qty > 0 → `dplExtCableColor` required; ext-cable qty ≤ 1 per AutoWand (×2 D&N, ×headrails common valance).

**If Cordless / CLDayNight (1508–1535):** pole (`optTiltType2`) → `dplCordlessTiltType` required — "Please select pole length."; pole or attachment → `txtWandQty` ≥ 1 — "Wand Quantity should be at least l." (sic); max **2 poles / pole attachments per shade**.

**Style-specific:** `RM003R` → `dplLadDecoTape` required — "Please select ribbon banding color."; `RM003E` → `dplEdgeBand` required — "Please select edge banding color."

**Palladian Shelf** (any of color/depth/width-type entered): color + depth required; ranges per §2.8; custom width → qty required, ≤ OrderQty.

**Magnetic hold-down:** `HoldDownBracket3` → `dpMagneticColor` required — "Please select magnet catch color."

---

## 4. Surcharge markers (`*`)

There is **no client-side surcharge computation** — pricing happens server-side. `*` appears only as a label convention:
- Option labels with `*` = surcharge upcharge (from the live form): Shade Style **Edge Banded…\***, **Ribbon Banded…\***, **Soft Fold\*** (`dplSlats`); label "AC Adapter Color\*" set at line 3195.
- `***` suffix on fabric colors = **discontinuation marker**, added when `EndDate == "4/29/2025"` (CallAjax `dplClothColor`, 150–152); selecting one SHOWs `spanendcolorpop` (`showPopFabricsColor` 3455).
- Trademark rewriting, not surcharge: motor names get `Norman™` for Canadian provinces (`txtS2State` in AB/BC/MB/NB/NL/NS/ON/PE/QC/SK) vs `Norman®` (195–202).

---

## 5. AJAX-driven option lists (`InitAjax2` line 4 / `CallAjax` line 27)

All are synchronous GETs returning JSON. Endpoints relative to the RM order page unless noted.

| # | Trigger | Endpoint + params | Fills | Notes |
|---|---|---|---|---|
| 1 | Shade style change | `getXmlRs.asp?tableType=GetClothtype&ClothCode={dplSlats}` (`GetClothtype` 2266) | `dplClothtype11` (fabric collections) | Client-side filters drop collections by shade type / pleated return / style (§1.1, §1.7, §1.8). Option title = Brand. |
| 2 | Collection change / style / valance | `getXmlRs.asp?tableType=GetClothColor&pgmCode=RM{dplSlats}&ClothCode={dplClothtype}&brand={Brand}&ClothDescEn={name}` (`changePattern1` 328) | `dplClothColor` | Option value=ColorCode, title=`MaxWidth\|Openness\|Joinable\|ClothCode`; `***` marks EndDate 4/29/2025. Caroline→AA0206 substitution. |
| 3 | Back fabric change (D&N) | same as #2 but `brand = Brand + "Dual"` (`changePattern2` 381) | `dplColor2` | Clarissa RD popup on select. |
| 4 | Style RM003R + specific cloths | `getXmlRs.asp?tableType=RibbonColor&pgmCode=RM&MountType=I&PLadderType=RBR&ClothCode=…&ColorCode=…` (`GetRibbonColor` 2449) | `dplLadDecoTape` | Only cloths AA0305/AA0355/AA0369/AB0203. |
| 5 | Style RM003E + specific cloths | same endpoint, `PLadderType=RB` | `dplEdgeBand` | Only cloths AA0210/AA0355/AA0369. |
| 6 | Motor control chosen / shade type / mount / width | `../RollerShadesRR/getXmlRs.asp?tableType=GetMotorTypeList&BlindNum={1|4|5}&MountType={I|O}&width={w}&fascia=RM` (`GetMotorTypeList` 2702) | `dplMotorType` | Post-filtered by business type (B vs non-B) and Canada (§1.16). |
| 7 | Motor type / "operated by another line" | `../RollerShadesRR/getXmlRs.asp?tableType=GetMotoTypeLine&LineNo={n}&dplMotorType={code}&flag={""|SW}&MotoContrlOpt=` (`getMatchMotoTypeLine` 3761) | `dplMatchMotoTypeLine`; `flag=SW` → `dplMatchSwitchMotoTypeLine` | SW variant only for Automate motors MT016/23/27/28. |
| 8 | Submit (size validation) | `getXmlRs.asp?tableType=RLBL_PdSizeRange&pgmCode={RM}&PgmSize={style}&PdType=8&BlindNum={n}&MountType={I|O}&pCompany={co}&ClothCode={CordType[_MotorType]}` (`CheckWLVal` 1664) | returns `[minW,maxW,minL,maxL,MaxSQFT]` | The authoritative size table; keyed by control type and motor. |
| 9 | Submit (side-by-side) | `getXmlRs.asp?tableType=ChecktMatchWindowType&pgmCode=RM&LineNo&ClothCode&dplSlats&CordType&Lining&MountType&RemoteQty&ColorCode&Orientation&MotorType&matchLineItem&cmbRoom&isSeam&ValanceType&RtnType&SWitchQty&MotoContrlOpt` (3369) | validation only | Returns mismatch field list or "2" (already matched). Orientation param only sent for colors F1082/F1083. |
| 10 | Shade type → single | `getXmlRs.asp?tableType=getSlats&pgmCode=RM` (`GetSlatRs` 3689) | `dplSlats` | D&N/Common Valance instead prune RM003R/RM003E locally. |
| 11 | Popup acknowledgement log | `../CommgetXmlRs.asp?tableType=UpdtRBCIntCheckPoPLog` POST `NotePoPType` (3474) | — | Logs that dealer saw the Orientation notice. |

**Not AJAX / static fills:** `dplAdapterColor` — `FillAdapterColor()` (3870) builds White(2058)/[Cottage White(2094) MT026 only]/Black(2208) locally. `cmbReturn` — built locally in `changReturnValue` (2291). Channel checkboxes — static 15×.

**Dead/absent:** `dplLightGuardColor` is never populated in this build — `IsDispLightGuardColor()` is commented out (633) and `trLightGuardColor` is hidden even for D&N (817); treat light guard as disabled for RM. `cmbRtnType12` (in the DOM) is never touched by RM JS.

---

### Implementation gotchas worth replicating deliberately (or fixing)

1. **Destructive resets:** changing Shade Type (754) or Valance (2372) blanks `dplSlats`, which cascades into re-fetching collections/colors — users lose fabric selections.
2. Any width/length edit force-unchecks the seam/railroad acknowledgement (`SetupCordType` 747).
3. `CheckWLVal` reads length from hidden mirror `PdLeng12`, not `PdLeng1` (1673) — port carefully.
4. `CheckSqMt` (838) is dead code; the live sq-ft cap comes from the size-range AJAX (`MaxSQFT`).
5. Many defaults are auto-corrections, not just defaults: D&N front/back positions auto-flip to opposite sides (680–688, 3823); common-valance motor positions force L/R and disable the selects (719–727, 2847–2852); `check_Info` re-enables all disabled selects just before submit so their values post (1635–1646).
6. Account/geo context changes the form: `txtbusiness_type` (B vs non-B) and `hidisCan` (Canada) filter fabrics (Daphne), motors (MT016/23/27/28, MT020/24/28), default control types (Cordless / CLDayNight), and trigger CARM safety popups; `hidIsCert` gates SmartRelease.


---

# Norman Roman Shades OrderRM.asp — field inventory (dumped from live logged-in form, 2026-07-01)

Legend: `H:` = hidden on initial load (default state: Single window, Single shade, no control type selected, Inside Mount, no valance, translucent lining). `*` after value = checked/default. `[a|b|c]` = select options. `*` inside an option label = Norman surcharge marker.

## Visible on initial load
- Room: SEL txtroomsel [Bathroom|Bedroom|Dining Room|Family Room|Foyer|Kid's Room|Kitchen|Living Room|Master Bedroom|Master Bathroom|Office|Other]; H:TEXT cmbRoom (free text when Other); H:TEXT txtBlindLoca
- Window Type: R WindowType=Single*; H:R WindowType=Side by Side
- Order Size: TEXT PdWidth1 + SEL cmbwidth [1/8..7/8]; TEXT PdLeng1 + SEL cmbLeng [1/8..7/8]
- Mount Type: R MountType=I*; R MountType=O
- Shade Type: R BlindNum=1* (Single); R BlindNum=5 (Day & Night); R BlindNum=4 (Common Valance); H:SEL dplHeadrailNum [2]
- Control Type: R dplCordType=Cordless | CORDLOOP | Motor | SRCordloop (all unchecked); H (Day&Night variants): CLDayNight, LPDayNight, MTDayNight, SRDayNight
- Chain Type: R dplChainType=CT001* (Standard plastic); R dplChainType=CT002 (Stainless); H:SEL dplLadderColor [White|Cottage White|Black]
- Chain Controls: SEL LiftPos [L|R]; R liftLenType=Standard*; R liftLenType=Custom; H:TEXT LiftLength1 + H:SEL LiftLength2; H:SEL dplLiftLength [16"|24"|36"|48"|60"|84"]
- Valance: R IsValanceType=None*; R IsValanceType=RM01 (Yes)
- Valance Returns: R cmbRtnType=No Return*; H:R cmbRtnType=Wrapped; H:R cmbRtnType=Pleated; H:R cmbRtnType=Wrapped(2nd); H:SEL cmbReturn []; H:SEL cmbRtnType12 []; H:TEXT ValDep1 + H:SEL ValDep2
- Shade Style: SEL dplSlats [Flat Fold without Seams | Flat Fold with Batten Back | Edge Banded (Flat Fold with Batten Back)* | Ribbon Banded (Flat Fold with Batten Back)* | Soft Fold*]
- Fabric: SEL dplClothtype11 [Alma|Ashley|Bali|Belgian Linen|Blake|Bora Bora|Breeze|Caroline|Catalina|Ella|Ellie|Francis|Impressions|Java|Lakeside|Lorraine|Louise|Patterns|Phuket|Riviera|Rochelle|Scarlett|Seabreeze|Sheer Elegance|Sierra|Solids|Sumatra|Taylor|Valencia|Whispering Willow|Windsor]; SEL dplClothColor [] (AJAX-filled); H:CB chkFabricAllowjoin1 (allow seams); H:R Pattern / Pattern=R; H:R Orientation=OS*/ON
- Lining: R IsLining=Translucent*; R IsLining=Blackout
- Magnetic Hold Downs: R HoldDownBracket=N*; H:R HoldDownBracket=Y; H:R HoldDownBracket=M; H:SEL dpMagneticColor [Antique Brass|Bisque|Black|Bright Brass|Brown Gray|Crisp Linen|Nickel-Plated|Pearl|Pure White|Sea Mist|Silk White|Stone Gray|String|Taupe Gray]
- Palladian Shelf: SEL dplPSColor [41 paint/stain colors 001 Pure White..862 French Oak]; TEXT PSDepth1 + SEL cmbdept; SEL dplPSWidthType [Default Width|Custom]; H:TEXT PSWidth1 + H:SEL cmbPSWidth; H:TEXT txtPSQty
- Quantity: TEXT OrderQty; TEXTAREA LineNote; BUTTON Back; SUBMIT Submit

## Hidden groups (revealed by cascades)
- Side-by-side / multi-panel sizes: CLeftWidth1/2, CLeftLength1/2, CCenterWidth1/2, CCenterLength1/2, CCenterWidthB1/2, CCenterLengthB1/2, CenterGapWidth1/2, CRightWidth1/2, CRightLength1/2, RightGapWidth1/2, GapWidth1/2; per-panel lift: RightLiftPos, LeftLiftPos, CenterLiftPos, CenterLiftPosB, RightLiftPos1; CB isEqualWidth; SEL matchLineItem
- Day&Night dual-panel: HCLeftWidth1/2 + HCLeftPullPos, HCRightWidth1/2 + HCRightpullPos; second fabric: SEL dplPattern22 [64 roller/dual patterns incl. Breeze Screen 1%/3%, NA300/NA400 series, Lola BO/LF, Verona LF, ...]; SEL dplColor2 []; CB chkFabricAllowjoin2
- Motorization panel: SEL dplMotorType [-- Norman® Smart: Best Value -- | Rechargeable Battery with AC Adapter Charger | DC Low Voltage Hard Wire | AC Adapter Plug-In | -- Economy -- | AutoWand | -- Other Options -- | Automate Home Li-Ion ARC Motor (Rechargeable) | Automate Home 12V Low Voltage DC Motor]
  - TEXT txtRemoteQty; SEL dplMotorizedShade [Will be operated by the remote on another line item | Does not need a remote]; SEL dplMatchMotoTypeLine []
  - R MotoContrlOpt=RT007 / RT017 (remote model options); TEXT txtACQty
  - 15× CB chkCH (channel picks) + 15× CB chkCH2 (2nd remote channels)
  - Wall switch: TEXT txtSWitchQty; SEL dplSWitchShade; SEL dplMatchSwitchMotoTypeLine; 5× CB chkSWCH + 5× CB chkSWCH2
  - Accessories qtys: txtHubQty, txtDCPanelQty, txtDCHarnessQty, txtBatteryWQty, txtChargingKitQty, txtSolar_Panel_qty, txtRepeaterQty, txtColorRingQty, txtChargingWandQty, txtExtension_Pole_qty, txtExtCableQty + SEL dplExtCableColor [White|Black]; R ExtensionCable=0*/79; SEL mdplLiftLength [8"..72"]; SEL dplAdapterColor []; LiftPosm/RightLiftPosm [L|R]; SEL dplTiltType [6.6 ft]
- Banding/decor: SEL cmbLadderType [Ribbon Banding]; SEL dplLadDecoTape [] (AJAX); SEL dplEdgeBand [] (AJAX); H:SEL dplLadderColor
- Tilt/wand (cordless?): R optTiltType= / Wand / PoleAtt; SEL dplCordlessTiltType [36"|60"]; TEXT txtWandQty
- Light guard: TEXT txtExtensionQty; SEL dplLightGuardColor [] (AJAX)
- Hember rail: R Hamber= / Hamber=HB005
