# Norman dynamic control and validation inventory — September 20, 2026

This supplement accounts for **all 21 current Norman destinations** and the dynamic implementation surfaces missing from the existing detail-field export. It is a code/ledger audit, not a claim that every source offering or every valid combination has passed production pricing.

Pinned code: `ce375e05bc8532833ab1a1be7b784b27820c43ac` (parent confirmed deployed). Baseline export: `outputs/norman-completion/current-catalog.json`, 21 destinations / 56 programs; its SHA-256 is in `snapshot.json`. Source content and proof pointers were read from the parent’s maintained `outputs/norman-completion` directory. The parent report and export generator were not modified.

## Review artifacts

- `destination-review.csv` / `.json`: 21 reviewed destinations, dynamic control scope, saved record, source pages, pricing status, production quote pointers, and exact remaining classification.
- `dynamic-controls.csv`: **616 source occurrences** of grid controls, helper-generated controls and dedicated React inputs. **114** occurrences match an exported detail-field ID; **444** do not; **58** are callback-bound dedicated inputs whose complete typed fields are in the next file. These are occurrence counts, not counts of distinct customer offerings. Some shared controls legitimately appear for more than one family.
- `typed-records.csv`: **641 typed property occurrences**, including nested panel construction, natural-unit ancillaries, atomic hardware/charging/clearance choices, shared valances and derived records. A typed property is not necessarily a customer-editable control; the record type and source location distinguish choice from derived output.
- `server-validations.csv`: **967 validation-helper/object occurrences** with exact expression and file/line. Helper-call arguments retain the rule name, page argument and message. For helper-defined source IDs, join the file to `module-source-index.csv` and the destination review; do not interpret the page number without that source ID.
- `server-configuration-reads.csv`: **1,198 direct configuration-read occurrences** to expose server-used fields and template-key families that a detail-field export misses. Derived records and historical aliases are intentionally retained; absence of a UI field with the same spelling does not itself prove a missing feature.
- `module-source-index.csv`: hashes and source-reference expressions for **97 scanned files**. Runtime source-page expressions and per-program page functions are preserved verbatim instead of being guessed.
- `build-inventory.cjs`: reproducible, read-only extraction from the pinned Git revision. It never queries customer data or changes a quote.

## Concrete source-backed work still missing

| Destination | Source-supported implementation gap | Exact source | Existing boundary / required hold |
|---|---|---|---|
| Ultimate Faux Wood | Standalone valance destination with an explicit valance inner length, finish/style, returns, joinery and specified keystone locations. | `Ultimate FW Blinds Guide`, p11: valance-only max inner length 384 inches; a piece exceeding 96 inches splits equally; connector is default; optional keystone permits equal or specified splits. The same page provides the normal keystone count/location rules. | The present `faux_wood` product always represents a blind/opening. `norman-ultimate-faux.ts` and `norman-ultimate-assemblies.ts` handle valances attached to blinds; neither creates a standalone product. Preserve a current standalone price/availability/fee hold. |
| SmartPrivacy Faux Wood | Standalone valance destination using explicit inner length and source finish/style. | `SmartPrivacy FW Blinds Guide`, p10: max inner length 384 inches; over 96 inches uses equal splits and standard connector; custom splits and keystones are unavailable. Revision table p2 records the valance-only addition. | `norman-smartprivacy.ts` derives valance dimensions from blind widths and has no standalone destination. Preserve a current standalone price/availability/fee hold. |

The above are **implementation gaps with sufficient assortment/specification evidence**, not missing assortment evidence. They do not establish an approved standalone selling price.

## Additional actionable review items — not newly confirmed defects

- **Wood common-valance cut-outs:** Guide p19 permits only the outer left/right edges. `norman-wood-assemblies.ts:82` implements this with actual ordered members. `norman-family-rules.ts:104` still rejects legacy `application`/`shade_type` common labels with cut-outs before checking a derived group. Normal current group controls need not set that legacy label. Add a focused legacy-edit/repricing regression before changing this guard; do not characterize the current normal path as broken without reproducing it.
- **Roller common-valance sizing:** Guide p37 calls for the largest required tube/clutch/fascia/bracket across the group. `norman-roller-common.ts:50` detects mismatched tubes and requires reconciliation, rather than automatically selecting the largest compatible full hardware set. This is a held, visible completion path. Common-valance charge allocation/width, exact material roll width, and p74 bracket rounding are separate evidence blockers, so automatic group sizing alone cannot make the common branch priceable.
- **SmartFold eligibility:** `norman-smartfold-eligibility.ts` deliberately prices only a bounded September outside/no-valance/Norman Smart rechargeable branch. Optional poles, premium hem, hold-downs, cordless/manual, common/custom and inside branches are still held even when some constituent controls have guide-backed rules. Review those branches individually before enabling pricing; the hold does not prove that every excluded branch lacks source evidence. Parent’s inside Basic Light Guard work is already in this snapshot, not a new missing control.
- **Shutter specialty/track/divider geometry:** Basic panel limits, regular frame construction and BiFold180 typed geometry are implemented. The broad remaining shapes/tracks exception is not a universal external-evidence blocker. Exact binder sections can support further bounded implementations; account-specific rates/surcharges remain external. Parent/Lotus owns this ongoing branch.

## Proof and source limits

Production references in the destination review point to previously recorded representative proofs; this report did not execute new CRM actions. Parent reported 805-0352’s inside SmartFold 3.5-inch clearance rejected against the exact 3.52 minimum, with restoration clearing that issue; full-reload proof was still in progress when this inventory was frozen. Its evidence pointer is `outputs/norman-completion/smartfold-inside-light-guard-production-20260920.json`. Pricing remains held for that inside branch.

Guide page references are the implementation’s source-page convention, supplemented by inspected PDF text for the two confirmed standalone gaps. `module-source-index.csv` preserves source IDs and page expressions; it does not imply every citation was independently re-rendered in this pass. The September Retail absolute PDF pages and printed pages differ; ancillary rows explicitly identify absolute pages 26–27. Current account R00743/RA00743 applicability to 805, dealer factors, shutter schedules, freight and processing fees remain unresolved and were not changed.

## Reproduction and interpretation

From the worktree with the installed TypeScript package:

```sh
node outputs/norman-dynamic-inventory-20260920/build-inventory.cjs \
  /Users/michaelshepard/Documents/805-norman-release-local-20260918 \
  ce375e05bc8532833ab1a1be7b784b27820c43ac \
  /Users/michaelshepard/Documents/805-norman-complete-20260918/outputs/norman-completion/current-catalog.json
```

The scan includes Norman catalog/type modules, Norman/Honeycomb/Roller validators and matrices, the shared rule entry point, dedicated Norman/San Clemente controls and `DesignCard.tsx`. Known non-Norman branches are excluded from UI rows. `shared_unscoped` rows preserve common or legacy controls whose applicability needs their enclosing function; they are not assigned to all 21 products. Product-case membership is a **candidate route**, not a statement that every field appears for every lift/application; the exact enclosing conditions are retained. Templates such as left/right cut-out fields and indexed splice locations stay as source templates so the finite generated family is visible without inventing independent choices.

This provides complete destination-level coverage plus a reproducible implementation occurrence inventory. It does **not** enumerate all possible state combinations, replace guide-by-guide source reconciliation, convert a held configuration to verified live, or certify all historical aliases as current choices.
