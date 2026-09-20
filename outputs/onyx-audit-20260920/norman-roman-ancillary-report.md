# Norman Roman ancillary audit — September 20, 2026

Status: implemented and tested in an isolated worktree. Not deployed or verified in the production CRM. No ancillary price is authorized automatically by this increment.

## Source and exact destinations

- `norman_roman_fabric_by_yard` / `norman_roman_fabric_by_yard_source`: 201 current source colors, one fabric cut with explicit yards; quote-line quantity must be one. No shade width or height is requested or used.
- `norman_roman_pillow_covers` / `norman_roman_pillow_covers_source`: 157 currently documented eligible colors, 11 cover sizes, knife edge or piping. Quote-line quantity means covers. The recommended pillow insert size is informational; an insert is not included.
- Existing Roman product/program/color identities and historical snapshots are unchanged.
- Complete cross-product ledger: `norman-roman-ancillary-ledger.csv` (402 current source/product rows, two retail-only exceptions, one discontinued identity). Full 33-cell pillow table and piping calculation: `norman-pillow-retail-cells.csv`.

Original PDFs were rendered and visually inspected for table meaning, not just text extraction:

| Source | Location | SHA-256 |
|---|---|---|
| Roman Shade Guide.pdf | Current source vault; pp34,46,50 and fabric list pp25–34 | d312848c45bf49ee3c06a6ae11f3f7b4cd7b53d88984f114598154c54628d151 |
| 2026Sep Retail Price Guide.pdf | 805-quote-v2-sources; absolute pp26–27 / printed pp25–26 | 3767de1e04ee7c8dc6bab14a6224868e4ca366f2ec4be2d8d3d13ec5cf45aafd |

The assortment consumes the parent implementation's `norman-roman-front-2026-09.json` (201 source rows), not the older July dealer list. This JSON is already present on the parent release; it is a dependency of this increment, not a new duplicated extraction.

## Reconciled rules and pricing evidence

Fabric by yard is documented for Roman fabrics, maximum 10 yards (Roman Guide pp34,46). The September retail guide provides PG1 $115/yard (4 colors) and PG3 $173/yard (26 colors). **PG2's 171 colors have no yard rate printed in September**. Existing July-imported $150 is not silently reused. Fractional yard requests retain their exact value but remain held because the sources do not specify ordering increments. Multiple cuts also require confirmation; line quantity cannot silently multiply the 10-yard allowance.

Pillow retail groups use exact collection/code routing:

- A: Alma, Caroline except AB0608, Windsor, Lakeside, Lorraine, Seabreeze, Taylor, Patterns, Francis, Valencia, Ella, Solids, Sierra, Ashley, Whispering Willow, Impressions, Louise.
- B: current Libeco Belgian Linen F1057/F1058; Rochelle, Breeze, Ellie.
- C: current Libeco Belgian Linen F1051/F1061.
- Retail table also names F1055 (B) and F1050 (C), but neither occurs in the current guide assortment. They remain exact unresolved exceptions; absence is not treated as proof of discontinuation.
- Taylor F0210 was discontinued September 1, 2026 (Roman Guide p2) and remains excluded from new ancillary choices.

Page50 excludes Sheer Elegance, Scarlett, Bali, Blake, Bora Bora, Caroline AB0608, Catalina, Java, Riviera, Sumatra and Phuket from pillows. **Patterns AB0635/AB0636 remain available in standard pattern. Only their reverse pattern, and reverse Impressions, are excluded.** This reading agrees with the fabric-list pillow flags and produces 157 eligible colors.

| Cover inches | Recommended insert inches | Group A | Group B | Group C |
|---|---|---:|---:|---:|
|14×14|16×16|83|147|179|
|16×16|18×18|90|154|218|
|18×18|20×20|98|202|243|
|20×20|22×22|107|226|306|
|24×24|26×26|130|258|338|
|10×14|12×16|75|122|147|
|10×16|12×18|83|139|162|
|10×18|12×20|86|150|170|
|12×22|14×24|90|154|186|
|14×24|16×26|102|189|221|
|14×18|16×20|90|154|186|

Piping adds 15% to the cover reference. These are USD **Norman suggested-retail references**, not dealer costs or approved 805 selling prices. No dealer factor, freight or processing-fee policy is changed.

## Saved model and validation

The new versioned `norman_roman_ancillary_v1` record owns the exact fabric code and either yards or cover size/edge/standard pattern. Each form keeps local edits and sends one complete record through **Save ancillary selection**, protecting rapid edits from stale save-queue props. A new catalog version is scoped to these two product IDs.

The server permits zero opening dimensions only for these exact product IDs with a typed matching record. Existing shade dimension validation remains unchanged. The source-reference helper never supplies a price grid or price snapshot: both products retain empty grids, manual-required status and explicit availability/price approval holds. Server-derived customer fields show yards per cut or cover size, edge and cover quantity; internal reference-price evidence is excluded from that projection.

## Tests and production proof still required

- 43 focused tests passed: ancillary 33-cell + piping calculations, all-fabric exclusions, natural-unit boundaries, no PG2 fallback, fractional-yard preservation, exact product scoping, server pricing hold, customer projection, JSON save/reopen equivalence and atomic form draft behavior; existing exact-interface and mobile-picker checks also passed.
- Full suite: 5541 passed, 28 skipped, one expected coverage-count failure (18→20 Norman families, 53→55 programs). Coverage test updated to the new counts and checks both new products retain empty held grids; updated coverage plus ancillary rerun: 12 tests passed.
- Final typecheck passed; no deployment performed by this agent.

Parent live check scenarios, internal draft only:

1. New **Fabric by Yard** line, Scarlett current color, 3 yards, quantity1. No Add Size requirement. Atomic save, close, reopen: exact3yards retained; reference $345; automatic price/delivery still held.
2. Same line request2.5yards: amount must stay2.5 after save/reopen, with exact ordering-increment exception (never rounded to2 or3).
3. New **Decorative Pillow Covers** line, Alma F1621,20×20,piping,quantity3. Save once, close/reopen: three covers, 22×22 recommended insert, $123.05 reference percover (not auto sellingprice), held delivery.
4. Test Patterns F1073 standard remains selectable; reverse unavailable. Test excluded Caroline AB0608 code absent. Libeco F1057 usesB; F1051 usesC.
5. PG2yardage retains missing-September-rate hold; no $150 fallback. 10yards boundary accepted as a held request; greaterthan10 blocked. No real customer send/order/checkout.

Remaining external evidence: authenticated ancillary ordering availability/options, fractional-yard increments and cut/order limit semantics, F1050/F1055 status, current PG2yardrate, applicable dealer charges/freight/fees/selling treatment, and representative portal comparisons. Until those are reconciled and production proof passes, these are documented held destinations, not verified-live automatic pricing.
