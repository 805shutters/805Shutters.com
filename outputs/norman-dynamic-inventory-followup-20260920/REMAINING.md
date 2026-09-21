# Norman non-shutter remaining-work classification

Read-only review against release `850ed5f1d558ba1b33f453a34aab600bf4d10d9b`, September 20, 2026. Supplements the 21-destination dynamic inventory; two implemented standalone valances bring the integration catalog to 23 destinations / 58 programs. These are finite findings from the listed exceptions and dynamic surfaces, not an exhaustive source-combination certification. No source or CRM state was changed by this review.

## Confirmed implementation work with source support

| Item | Exact source | Current gap | Bounded completion and retained hold |
|---|---|---|---|
| Roller Valance Only | September 16 Roller Guide p37; finish table p38; splices pp39–40 | No standalone Roller valance destination. Existing common-valance logic requires shade lines. | Add natural valance quantity/width and explicit finishes/returns/mount. Exclude 3.5-inch fascia/fabric valances, Modern Wood and Cassette; minimum width8; no raceway, large valance brackets. Preserve price/availability/fee holds. |
| Roller Separate Valance | Same guide p37 | No distinct valance line associated with mixed-lift shades. Current common grouping intentionally requires matching lift/power. | Associate exact selected shade lines; matching mount, shade raceway, no valance raceway; single/dual cannot share; enforce <=20-inch cordless large-tube incompatibility; no At Gaps splice. Record recommended width range separately from hard constraints. Shared retail basis remains unconfirmed. |
| Roller full common hardware upgrade | Same guide p37, size chart p41 | `norman-roller-common.ts` checks mismatched tube strings but only stores a prose requirement for largest tube/clutch/fascia/bracket. | Derive complete largest-compatible hardware across actual members, retain per-member dimensions. Keep custom bracket rounding and price-allocation holds distinct; map documented fabric widths as the next row describes. |
| Roller valance material-width mapping | September16 Roller Guide p5 definition; fabric-list tables pp6 onward; splice formula p39 | Common groups always receive a material-width hold for Fabric Valance/wrapped fascia although source tables provide code-specific Fabric Width. | Extract/reconcile exact color widths, including revision p2 changes; use min(95,fabricWidth-7) for Fabric Valance and min(95,fabricWidth) for wrapped fascia. Preserve a hold only for codes without confirmed mapping. |
| SmartFold magnetic installation space | SmartFold Guide p20 | `norman-smartfold-hardware.ts` accepts hold-down/finish but captures no available side/bottom clearance. | Measured available side >=9/16 and bottom >=11/16 from shade edge/sill; saved/server checks and atomic UI. Parent owns. Current optional-branch pricing hold stays. |
| PerfectSheer magnetic installation space | PS-SD Guide p45 | `norman-perfectsheer-hardware.ts` derives advisory9/16 and11/16 dimensions but does not validate measured available space. | Same measured constraints, including automatically included AutoWand door magnets; parent owns. Do not suppress the existing door default. |

Source PDFs reside in `/Users/michaelshepard/Documents/805/outputs/catalog-audit-2026-09-17/current-sources`; inspected page text resides in the parent's `outputs/norman-completion/source-text` JSON files. Page numbers above use those page records.

## Implementation/verification work that is not a new external blocker

- **SmartFold bounded pricing expansion:** `norman-smartfold-eligibility.ts:smartfoldBranchExceptions` deliberately excludes manual/cordless, optional hem/hold-down/poles, common/custom and inside branches. Some component rules and price identities already exist. Outside no-valance manual/cordless and simple accessories should receive individual backend/source reviews and live proofs before any eligibility expansion; calling all of them missing manufacturer evidence is inaccurate. Source pages20–21,34,37–38 cover several prerequisites. Inside roll diameter and custom bracket rounding remain separately unresolved. The October revision requires its own effective version.
- **Wood legacy-label regression:** `norman-family-rules.ts:104` blocks cut-outs whenever legacy application/shade_type says common, even though `norman-wood-assemblies.ts:82` can validate actual outer member positions (Ultimate Wood Guide p19). Normal current grouping does not require the legacy label. Add a saved-legacy repricing regression, then narrow the blanket guard only when a fully derived group proves outer positions. This is a conditional code inconsistency, not proof that current normal grouping is broken.
- **Roller source-backed hardware/common/panel proof is complete for representatives:** 805-0349 common assembly remains correctly held; 805-0350 panel passed positive,19-motor negative and restored reload checks. Parent RESULTS still calls production comparison in progress. Preserve dealer comparison as separate unresolved work.
- **Complimentary SmartFold pole is already implemented:** `norman-assemblies.ts` assigns one30-inch pole per cordless order, one owner, regardless of line quantity; source SmartFold p21. Do not list it as missing.
- **Order-wide motor support already exists:** shared panel family/capacity/ownership, mixed36W/65W requirements, network repeaters and per-family charging kits are implemented in `norman-assemblies.ts`. Do not label cross-product accessories entirely absent. Deliberately separate charging connector families must not be merged without evidence that the manufacturer counts them as one order/kit family. Exact unsupported identities remain below.
- **New standalone Ultimate/SmartPrivacy valances:** implementation and full6164-test/build gate complete in9276726e; production proof pending this review. Source rules available, price/availability/freight still held. This distinction supersedes older ledger statements that the destinations are absent.

## Genuine guide/account ambiguity or missing price evidence

| Family | Exact unresolved scope; do not invent a rule or price |
|---|---|
| Honeycomb | Horizontal Day & Night formula and SmartFit Dual Frame frame/net-shade price basis (`norman-honeycomb-dual.ts:55–57`, September retail pp10–12,14); Automate charger identity5V/2A versus retail5V/1A (`norman-honeycomb-motor-accessories.ts:34`). Existing mounting, charging and specialty geometry are implemented/proved for samples. |
| Vertical Honeycomb | Representative route, mounting and pairing are implemented. No new concrete missing rule established by this bounded review; exhaustive source/configuration and dealer comparisons remain verification work, not a named external source conflict. |
| Roller | Shared valance retail charge width/allocation; custom bracket formula rounding (Guide74); dealer comparison. The material-width source exists in the fabric-list tables and is implementation work above, not universally missing evidence. New destinations alone do not establish pricing. |
| SmartFold | Inside roll-diameter/depth mapping; custom valance bracket-count source discrepancy; unsupported branch verification and October-effective motor revision. Existing charging ownership is no longer a blanket missing implementation. |
| PerfectSheer | Modern Wood bracket assignment/flush depth; p38 table allows five keystones while text limits three; common Light Guard charge scope; Automate extra-kit price identity (`norman-perfectsheer-motor-accessories.ts:38`). Exact hardware and accessory records otherwise exist. |
| SmartDrape | Motor center-opening bracket count above94.25 through94.5; pocket depth above8.875 and below9; exact30-inch center-opening gap; blankF2128–F2130 factory aliases; standalone replacement-vane price conflict. Existing tracks, pairing, packs and motor accessories must not be relabeled missing. |
| CityLights | Half-inch current slat availability; account factors/fees; exhaustive comparisons. All52 current color/slat routes are implemented. |
| Wood | Mounting minimum1.375 versus1.625; short-wand running change; final inside grid cell; standalone assortment not established by inspected guide. Do not extrapolate the Faux valance-only rule to Wood. |
| Ultimate Faux | Common/custom charge-width and multiple-keystone basis; final inside grid cell; new standalone price/availability/freight. |
| SmartPrivacy | Final inside grid cell; new standalone price/availability/freight. |
| Synchrony / Palladian | Dealer factor applicability. Palladian standalone freight remains unresolved even though both retail schedules exist. |
| San Clemente / Contract | Current project base/option/freight schedules; Contract Vertical inside-depth table0.75 versus drawing3.75. Held catalog destinations already exist. |
| Roman shade / fabric / pillows | Existing assortment/rules and natural-unit destinations are implemented; ancillary current availability, approved standalone price/fees and source group2 yardage rate remain held. No further concrete missing source-backed control established by this bounded review. |
| All | R00743/RA00743 Ken Hill/MTS account applicability to805, dealer factors, freight, oversize and processing treatment remain unresolved. Preserve existing selling policy and historical snapshots. |

## Priority and ownership

1. Prove the two newly deployed Faux valance destinations through save/full reload/reopen and blocked customer output (Onyx agent).
2. Add Roller Valance Only/Separate Valance held destinations (Onyx agent, new isolated branch).
3. Add measured SmartFold/PerfectSheer magnet clearances (parent).
4. Map exact Roller fabric widths and derive full group hardware (Onyx agent after destination work).
5. Review one SmartFold eligibility branch at a time; legacy Wood regression; then remaining representative/exhaustive proofs.
6. Obtain exact manufacturer/account clarifications for the table above. They cannot be replaced by successful code tests.
