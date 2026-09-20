# Lotus catalog audit — 20 September 2026

This ledger covers every row observed in all seven custom collections and all twelve stock/parts collections, including pagination and every variant table on 270 product pages. It does **not** certify that every Lotus offering is live in the CRM. All rows explicitly identify the remaining exception; matching stock prices alone do not prove a selectable, saved customer configuration.

## Results

- CRM source: five product families, 20 custom programs, 1,580 matrix cells (1,494 priced, 86 explicitly unavailable), 3,206 stock records. The source has 2,894 distinct stock rows before parser expansion.
- Current dealer portal: 820 custom listings across 45 collection pages. 702 exact source SKU destinations; 118 unmatched. Among mapped listings, 374 displayed prices conflict, 42 agree and 286 display no collection price. An unmatched SKU is not automatically a new price group and is not silently aliased.
- Stock/parts: 2,890 variant rows on 270 product pages (108 blind/shade/vertical pages, 162 parts pages). 2,216 exact source matches: 2,213 prices agree; three differ. 674 have no exact imported stock destination, including 162 parts rows. Two explicitly discontinued listings refer to the same part; do not interpret other absent, negative-quantity or old-spec items as discontinued.
- Every custom cell, observed custom listing, observed stock/part variant, imported program, and source SKU absent from the observed website has a row in the accompanying ledgers. Assortment rows are not promoted wholesale to verified live. Exact saved/reopened configurations are separately identified in production-configuration-ledger.csv.

## Source authority and pricing contradictions

The pinned 113-page `Lotus.pdf` is West A26.v1, modified 2026-04-01, received 2026-07-20; SHA256 `4e9aba91a601e1212a3e8a1531c361caf033c28ef6ca1fdac3ad6247502a982f`. It publishes dealer-net grids but no effective date. Imported source costs, IDs and selling policy remain unchanged: 3x generally; Snow White FTX alone 2.5x under the existing owner-approved policy.

The current authenticated portal account visibly identified MTS Installations / the 805 business account. Account identity is verified; that does not establish a controlling price effective date. All portal observations are dated 2026-09-20 and prices are displayed unit prices before checkout adjustments. No checkout, purchase, payment, order submission or outreach occurred.

The dealer FAQ currently links these documents:

- [V1.1.25 assortment catalog](https://cdn.shopify.com/s/files/1/0723/5085/9514/files/V1.1.25_catalog-compressed.pdf?v=1749232524), 36 pages, SHA256 `8faa4c75054e8e5434df85fa5a9c56ae6bebe78dc37c91ec81a20178b5ca71b9`. This is an assortment catalog, not a replacement rate schedule.
- [Ordering guide](https://cdn.shopify.com/s/files/1/0723/5085/9514/files/orderguide_form.pdf?v=1749232248), two pages, SHA256 `ae809d42501847688fc77ec5b61a1d8b0ab8432683993b433166fa49eceec50e`. It describes cutdowns, packaging and order surcharges but does not resolve current custom rates.

Six exact custom configurations were added to the previously empty dealer cart, each quantity one, with note `INTERNAL AUDIT 2026-09-20 DO NOT ORDER`. The final cart contains five at $105 each and one at $26.30, total $551.30; it is preserved for vendor reconciliation:

| Program | Exact SKU | Dimensions | Guide dealer cost | Cart unit price | Guide page |
|---|---|---:|---:|---:|---:|
| FLXE | CFLX2736EBW | 27 × 36 | $30.39 | $105.00 | 100 |
| FGX | CFGX5960BW | 59 × 60 | $62.63 | $105.00 | 104 |
| RLX | CRLX7296W | 72 × 96 | $56.26 | $105.00 | 96 |
| RTX | CRTX4872W | 48 × 72 | $38.34 | $105.00 | 98 |
| MLX | CMLX4860W | 48 × 60 | $21.74 | $105.00 | 95 |
| AMX | CAMX2772W | 27 × 72 | $26.30 | $26.30 | 97 |

MLX and AMX product pages, like their collections, did not display a price; the cart revealed the prices above. The matching AMX example is positive representative evidence, not exhaustive current-price certification. Earlier recorded FLX/FCX conflicts remain unresolved. Repeated $105 prices across different custom sizes may be placeholders, but this is an inference, not authority to replace them or publish the old guide as current. The portal's mostly matching stock rates support treating stock and custom separately.

Only three exact stock matches differ: `FLX1172EBWH` $105 versus guide $19.49 (page 42), `AMX9548WH` $98.07 versus $98.08 (page 21), and `AMX2396WH` $19.92 versus $19.91 (page 23). The last two are one-cent differences; their controlling source still needs confirmation.

## Program-by-program disposition

All 20 imported programs retain their IDs and readable history. Exact matrix counts and every unavailable cell appear in `program-ledger.csv` and `custom-grid-ledger.csv`.

| Programs | Implemented or already represented | Exact remaining exception |
|---|---|---|
| MLX, AMX | Imported full grids; new White/Alabaster choice uses color-specific SKUs from the next size cell, enforced on server for newly typed configurations | 7 MLX and 14 AMX custom listings lack exact original-grid matches (now assigned held destinations); custom collection prices absent; MLX cart price conflicts, one AMX cart price agrees; typed AMX representative pricing and customer output verified in 805-0339 |
| RLX, RTX | Imported grids; new White selection tied to source cell; exact cart conflict guarded | 68 RLX and 2 RTX custom listings unmatched, including portal RLX Alabaster SKUs absent from source; current authoritative custom rates required |
| FLX, FLXE, FCX, FGX | Fixed finishes, exact grids, typed one/three-blind configuration; confirmed conflict controls | Four faux programs have current/prior guide-versus-portal conflicts; 27 faux custom listings unmatched overall; source limits versus website specification contradictions unresolved |
| FTX, FTX-LG | Source page 101 SKU lists now split by Snow White versus Light Gray; no price/ID changes | 14 priced Light Gray cells contain no Light Gray SKU in source; some printed codes are malformed; no current custom collection listing, vendor ordering codes required |
| FPX | Imported privacy program and historical records retained | Absent from current linked assortment and current collections; no affirmative discontinuation evidence; vendor current-availability confirmation required |
| RS 1%, RS Blackout | Separate program IDs; owner-approved same-cost Blackout policy retained; 147 observed stock roller variants agree | Custom roller collection empty; Blackout-specific current SKU/color availability and manual spring/valance configuration proof required; cloned source SKU metadata does not prove a Blackout ordering code |
| CV steel complete, CVH steel headrail | Separate complete/width-only imported grids | Empty custom vertical collection; current ordering choices, headrail/vane/color/unit configuration and production proof incomplete |
| CVN aluminum one-way, CVNO one-way headrail | Separate complete/width-only imported grids | Same vertical exception; no substitution between steel/aluminum or complete/headrail |
| CVNC aluminum center-draw, CVNC headrail | Separate complete/width-only imported grids | Same vertical exception; current stack/control compatibility must be explicit |
| CVV vanes | Height-only grid retained; customer delivery blocked | Guide custom amount does not define per-vane versus casepack; stock portal vane packs are not authority to infer custom quantity basis |

## Options and assortment gaps

The current catalog advertises cordless vinyl/aluminum/faux programs, manual spring rollers with valance, and steel/aluminum vertical systems. Current guide rules include a 25% broken-package charge for applicable stock, $5 for orders below $50, inside-mount deductions and cutdown limits. The order guide says use the larger stock size plus cut charges. Selecting a custom grid cell does not prove that a particular available stock donor can be cut to the requested size. Do not apply donor-cut restrictions using only the next grid breakpoint.

The CRM now has exact held stock/parts destinations for the observed accessories: brackets, wands, clips, end caps, valance parts and replacement parts. These establish identity and readable source evidence; compatibility, current dealer pricing and an order-level accessory model are still incomplete. Those 162 parts remain separately inventoried in the stock ledger. Current parts pages sometimes display their SKU in the `QTY Available` field; that text is preserved as evidence, not treated as actual inventory quantity. Two blind variants lack a displayed SKU (FCX 72 × 60 Soft White, RLX 69 × 48 White). Several website dimension/cutdown fields conflict with SKU or guide, including FTX5860LG described as 59 × 60 and sequential FCX cutdown values. These metadata conflicts need vendor correction.

No current collection listing for a source SKU is not evidence that it is discontinued. Source-only SKUs are explicitly enumerated in `source-skus-not-observed.csv`. Two portal pages explicitly label an FCX2UWAND29AL wand discontinued; historical use remains readable. No source products were removed or repurposed.

## Implementation and verification

- FTX per-color ordering-code metadata corrected in importer and generated catalog. A structural comparison confirmed the only catalog changes are the two SKU matrices; prices, IDs, stock records and other metadata are identical.
- New mini/vinyl color controls persist a versioned color choice and are filtered by the current size cell. The server rejects missing/incompatible colors for newly typed configurations. Historical untyped data remains unchanged.
- Source conflict findings and customer-delivery checks added for the five cart-confirmed conflict programs; existing FLX/FCX, side-mount and vane-unit exceptions retained. Original guide grids and dealer-versus-retail distinctions remain intact.
- Reproduce the complete ledger with `python3 scripts/audit-lotus-portal-20260920.py`. It reads committed observation snapshots and the current catalog; it performs no network calls or mutation.
- Targeted UI, color validation, pricing, authority and server-repricing checks: 50 tests pass across five files. Importer regeneration completed successfully with the pinned PDF. TypeScript checking reported only missing dependencies in the shared canonical node_modules link (pglite, puppeteer/chromium, pdf-lib) and related pre-existing errors, with no Lotus errors. Production save/reopen validation must follow integration and deployment; no row is promoted to verified live merely because a unit test passes.

Completion still requires a current account-specific Lotus custom price schedule/effective date, dispositions for every unmatched and source-only SKU, missing Light Gray/Blackout ordering codes, vertical quantity/operating rules, price-confirmed stock/parts compatibility, and complete production pricing/customer-output evidence for all five families. Supplier outreach was not authorized or sent.

## CRM destination implementation and production proof

See [production-proof.md](production-proof.md) for the saved/reopened native quote 805-0337 and legacy diagnostic quote 805-0334. The full [offering-destinations.csv](offering-destinations.csv) assigns all 3,710 dealer observation rows to versioned held CRM destinations. Existing custom grids and IDs are preserved; two explicitly discontinued parts rows are retained for history and excluded from current selection. The destination registry establishes assortment identity only, with no automatic pricing or inferred compatibility. The destinations deployed in d28bd77d. Three representative exact custom/stock/parts identities saved and reopened in quote 805-0337; their prices remain held. A zero-dimension sibling exposed a whole-quote repricing failure, documented in the production proof and fixed separately.

### AMX restriction normalization, September 20

New `lotus-amx-v1` configurations use cordless lift, the included standard headrail without a valance, exact source-cell colors, and inside-opening dimensions. The factory deducts ½ inch from nominal width. Widths must be quarter-inch increments and heights whole inches. A same-color stock donor inside the priced cell must exist: donors at or below 22 inches cannot be width-cut; wider donors permit ¼–6 inches of width removed. The maximum supported height cut is 10 inches. The current linked catalog's AMX-specific page 13 says 10 inches while its general page 34 says 12; the linked order guide also says 10. Cuts beyond their common supported range remain blocked pending clarification. Source `lotus-digital-catalog-v1-1-25` is immutable, pinned and retained in the external source vault.

This resolves the blanket AMX restriction status only for new typed configurations; old snapshots and prices remain unchanged. Outside/side mounting, unsupported motors/valances, impossible donor cuts and unavailable cells remain blocked. The September 20 CAMX2772W cart comparison remains representative current-price evidence. It does not establish the controlling effective date for the entire price book, final freight or applicability of checkout/order-level dealer charges. Existing 805 selling-price policy is preserved. The typed route deployed in f0203d90; the actual save-gate repair and production evidence completed on fed42ad5. Native quote 805-0339 saved, fully reloaded and reopened at $117.90 with the exact AMX configuration and customer preview. Mixed quote 805-0337 retained both valid AMX and FTX prices beside six held lines.

AMX's verified $26.30 is **dealer merchandise cost only**, not an all-in landed cost. Lotus remains `freightStatus: unresolved` / `costStatus: incomplete`. Current 805 customer selling policy multiplies the custom source cell by 3; it does not multiply a final dealer invoice. The existing send gate therefore permits a fully valid AMX retail configuration while showing unresolved dealer cost, as it already does for supported FTX. No manufacturer surcharge or freight assumption has been substituted into selling prices.

### Exhaustive source-grid routing check

`pricing.lotus-grid-audit.test.ts` checks all 1,580 cells across the original 20 programs, both at the exact boundary and one sixteenth below it. All 1,494 priced cells reach the expected independent dealer-net and retail values; all 86 unavailable cells remain unavailable. This is 6,320 price-engine assertions, including width-only headrails and height-only vanes. It verifies routing and retained selling-policy arithmetic; it does not resolve current dealer authority, fabric/option compatibility or the vane quantity basis.

### RS roller configuration capture

New `lotus-roller-v1` records preserve the exact 1%/Blackout program, White fabric, cordless spring lift, one shade and smooth included valance (or installation without it). Inside-mount fit and measured recess depth now have explicit controls. Server validation enforces page29 minimums: with valance, 2 inches semi-inside or 3-15/16 flush; without valance, 3/4 inch semi-inside or 2-3/4 flush. Opacity/program mismatch, unsupported colors/motors and multiple-shade configuration are rejected. Existing untyped history stays readable. These rules do not enable automatic RS pricing: custom source authority, exact Blackout ordering codes and cut feasibility remain unresolved. Tests cover each exact depth boundary and1/16 inch below it. Typed RS 1% controls saved and survived a full reload of native quote 805-0337 on fed42ad5: White, Smooth valance, Inside Mount, Semi-inside, 2-inch recess. Pricing remains held.

`amx-boundary-color-ledger.csv` additionally enumerates both colors at all 136 AMX grid boundaries (272 cases). 169 have both an exact color ordering code and a documented stock donor at that boundary; 50 lack the color ordering code; 29 have a custom ordering code but no matching donor at that exact boundary; 24 are the two-color views of 12 unavailable cells. These boundary exceptions stay blocked under the typed rules. Interior dimensions can have different donor feasibility and are checked by the runtime; no live inventory is inferred. Reproduce with `scripts/audit-lotus-amx-boundaries-20260920.py`.


### Vertical source controls, with price holds retained

All seven existing vertical programs now have versioned complete-blind / headrail / vane identity, steel versus aluminum construction, and one-way versus center-draw rules. Complete and headrail systems retain White headrails and documented wand control. One-way requires Left or Right stack; center draw requires Center. Standard wands are 30 inches; steel-system optional 48/60/72-inch wands require White or Alabaster accessory color and remain subject to price confirmation. Color choices use exact custom-cell ordering SKUs, including height-only vane and width-only headrail axes. The source's White/Alabaster stock assortment does not silently broaden an all-White custom cell.

Exact finished measurement basis is retained without an inside deduction. Vanes-only hides headrail/stack/wand controls and preserves the unresolved per-vane versus carton basis. Complete steel and one-way aluminum use the documented matching valance; custom center-draw package inclusion is explicitly unresolved rather than inferred. New typed records reject incompatible identity, colors, stack, wand, valance, measurement basis or motors. Older untyped history stays readable. All seven retain restriction-source-incomplete pricing holds; no rate, shipping charge or selling policy changes. These controls are implemented and tested; production persistence remains a separate pending gate.


The [production configuration ledger](production-configuration-ledger.csv) separates the two exact representative configurations verified live (AMX and FTXLG) from held configurations and source identities. A verified configuration is not a certification of every cell, color, dealer charge or current inventory item in its program.
