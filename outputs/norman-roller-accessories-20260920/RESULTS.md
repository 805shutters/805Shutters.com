# Norman Roller accessory completion

## Magnetic and traditional hold-down increment

Source: current Roller Shade Guide, September 16 2026, PDF/printed p43; September Retail Price Guide PDF p20 (printed p19). These were independently read; p45 color graphics were visually inspected for the next Light Guard increment.

- Catch colors: Nickel-Plated default; Pure White, Silk White, Bisque, Pearl, Bright Brass, Antique Brass, Black, Crisp Linen, String, Sea Mist, Stone Gray, Brown Gray, Taupe Gray.
- Traditional and Magnetic hold-downs are optional and prohibited with LightGuard360. One left/right pair per physical shade. Dual uses the rear shade; Coupled uses each component. Magnetic catches install at the job site; magnets are factory fitted to the rear of the hem bar.
- At least 9/16 inch beyond each finished shade edge and 11/16 inch below shade/sill. Store the smaller bottom clearance at both catches; coupled selection represents minimum clearances across all catches.
- Magnetic retail is $28 per shade. Cassette price includes magnetic hold-downs, so do not charge that surcharge twice. Account cost policy is unchanged.
- Traditional availability is source-backed; its charge/inclusion is not stated. It has an exact pricing hold until confirmation.

Typed atomic record `roller_accessories_v1`; server-derived `roller_accessory_source_v1`; current Roller r8. Older r7 remains recognized without newly reinterpreting saved historical configurations. Existing common hardware and exact material-width rules remain active in r8. Legacy magnetic selections must be migrated to measured selections before current pricing.

Tests: 14 colors; three exact positive/negative clearance boundaries; malformed/legacy records; LightGuard360 exclusion; Dual/Coupled count; Cassette no duplicate charge; $28 × quote quantity; real saved backend positive/negative and forged-record reconstruction; save/reopen; atomic stale acknowledgement; historical r7. 6418 full-suite tests passed with 28 skipped before the final additional saved-backend regression (22 accessory tests now pass). Typecheck and production build passed.

Production proof pending parent deployment. Chain, order poles and Basic/Premium Light Guard remain the next finite guide-backed increments; no claim that all accessories are finished.

## Operating chain increment

Source: Roller Guide p44 exact table; September Retail PDF p20 lists stainless steel chain at no extra charge. Current r9; r8 is preserved.

SmartRelease default at heights 12–18: Y−2; (18,30]:16; (30,42]:24; (42,54]:36; (54,66]:48; (66,90]:60; (90,144]:84 inches. CCL default Y≤25.5:Y−2, otherwise 2Y/3+6. SmartRelease custom minimum10; CCL custom strictly greater than default. Custom above Y−2 requires no lower obstruction, and cannot exceed280. Clearance below tension device at least2; safety tension-device confirmation required. Exact chain material and eight Plastic colors are saved atomically. SmartRelease0–1.18inch tolerance and each-member chain basis are persisted. No guessed rounding.

Validation: 16 SmartRelease boundaries; CCL25.5 boundary; strict custom minima and280maximum; obstruction and2inch safety boundaries; stale/inapplicable records; atomic edits/reopen; historicalr8; real saved backend positive48inch chain and negative1.999inch clearance. 6441 full-suite tests passed/28skipped before one final added backend regression (22chain tests now pass). Build/typecheck tracked separately in parent handoff.

## Order-level pole increment

Roller Guide p44: exactly one complimentary fiberglass pole per eligible cordless Roller order. 30inches when all shades are≤96inches high, 58inches when any is>96. LightGuard360 is excluded. Extra30/58fiberglass ($28),36/60black fixed-head cordless poles ($89), and black attachment-only ($40) use existing September retail p20 IDs. Maximum one additional pole OR attachment per physical shade; coupled component count and dual two-shade count are explicit. Attachment is for screw-tip poles and is not a replacement for the cordless fixed-head pole.

Currentr10 preservesr9; shared `roller_pole_order_v1` is rebuilt from selected lines and gives one deterministic owner fulfillmentQuantity1, all other lines0. Extra counts multiply quote assembly quantity once. 6451 full tests passed/28skipped before one final backend regression (10pole tests now pass); typecheck/build passed. Tests prove96/96.001, selected-only membership, one order pole despite multiplelines/quantities, stale record reconstruction, extras rates/limits, real saved backend and negative overquantity. Production proof pending deployment.

## Basic and Premium Wood Light Guard increment

Source: Roller Guide PDF p45 (color graphic visually checked); September Retail PDF p20. Basic exact finishes: 3058 White, 3094 Cottage White, 3578 Sahara, 3463 Chocolate, 3129 Silver, 3212 Black Ink, 3012 Bianca. Premium Wood: 049 Stone Gray, 053 Clay, 110 Limed White, 212 Dark Teak, 109 Weathered Teak, 237 Wenge, 221 Black Walnut.

Inside Mount only; excluded from LightGuard360; Cassette accepts Basic only and has no top block. One set has two side blocks; coupled/common assemblies receive one set. Common members must agree on finish and channel lengths; one deterministic owner receives the surcharge. Single top block uses a white 4.5-inch vane; Dual uses white room-darkening fabric about 8.5 inches high. Basic costs $45, Premium Wood $117 per set using existing retail IDs; dealer factors remain unchanged.

Explicit requested left/right channel lengths are stored without inventing factory cutting deductions. Basic channels through 96 inches remain one piece; (96,102] splits 6 inches from top; above 102, top piece is length minus 96 and lower piece 96. The diagram occupies the Basic row, so Premium Wood above 96 remains held for a confirmed splice schedule. Wood Stone Gray/Limed White channel width is 35 mm; other wood colors retain 30 mm with an explicit unconfirmed running-change status. Basic uses 35 mm.

Current r11 preserves r10 snapshots. Typed atomic record roller_light_guard_v1 and derived roller_light_guard_source_v1 are rebuilt on save. Tests cover all 14 exact finishes, 96/102 boundaries, mounting/Cassette/system conflicts, missing or stale records, common matching and one-set charge, coupled one set, exact $45/$117 times quantity, previous catalog recognition, reopen, and actual saved backend positive/negative mounting. 6477 tests passed, 28 skipped; typecheck and production build passed. Production proof remains separate and pending deployment.

## Finite remaining evidence and live work

All four identified Roller accessory branches now have source-backed implementations: hold-downs, chain, order poles, Light Guard. Chain and hold-down implementation are deployed; pole and Light Guard deployment/live proof remain parent-coordinated. No claim of exhaustive live certification is made before saved/reopened positive and negative UI checks.

External evidence still required: Traditional hold-down charge/inclusion; standalone Valance Only/Separate Valance price and account availability; common-valance shared price width/allocation; factory bracket thresholds (p70/p73) and custom bracket rounding (p74); Premium Wood Light Guard splice schedule above 96 and effective date of other-color channel-width running change. Physical tube diameter can be explicitly recorded; All Tubes is a table classification and does not prove actual diameter. These precise holds remain intact.
