# Quote V2 wholesale-ledger evidence map — 2026-07-26

Status: source inventory complete; ledger implementation isolated and unapplied.

This record separates three facts that must never be conflated:

1. a manufacturer document or portal observation exists;
2. its contents have been normalized into source-controlled catalogs or rules;
3. an exact product/account/version has been reviewed, published, and is
   authoritative enough for a customer quote.

The supplied documentation is not missing. The remaining gaps are exact
product identity, current-account authority, effective-version authority,
source conflicts, and connection to the production quote route.

## Durable runtime contract

Quote-time pricing must not scan PDFs, spreadsheets, screenshots, or Markdown
receipts. The wholesale ledger stores normalized version, program, dimension
cell, option-component, freight/other-cost, and source-provenance rows. The
trusted pricing service looks up an exact published version by:

- manufacturer and the server-owned `805` account scope;
- product, program, style, and color;
- width/height grid ceiling;
- normalized configuration options; and
- effective business date.

The lookup is service-role-only and indexed. It returns base and option dealer
costs, applicable order-cost rules, immutable source identities, and a lookup
fingerprint. The browser and public quote routes receive none of those internal
amounts or provenance. An authoritative quote snapshot retains the published
wholesale version and fingerprint so a later catalog revision cannot silently
change an existing quote. Snapshot persistence replays the same indexed lookup
from its normalized manufacturer/product/configuration/dimension/options/date
input and rejects any version, fingerprint, base/option cost, unit cost, or
line-total mismatch. Retired versions remain queryable only inside their closed
historical effective interval.

No version in the Phase 1 seed is published. Until review and publication,
runtime lookup returns `WHOLESALE_VERSION_NOT_PUBLISHED`.

## Source-vault closure

The immutable source vault is
`/Users/michaelshepard/Documents/805-quote-v2-sources`. The prior verifier
confirmed all 14 artifacts against
`src/lib/quote-v2/source-manifest.ts` and
`src/lib/quote-v2/source-artifacts.lock.json`. The source vault remains external
and read-only; generated catalogs and retained evidence receipts are stored in
the repository.

### Norman

| Source | Coverage and authority | Effective/revision evidence | Current integration | Actual gap |
|---|---|---|---|---|
| `2026Jul Retail Price Guide (1).pdf`, SHA `ae102c…2f3` | Suggested-retail grids, options, and freight for Norman products, including Ultimate page 30 and SmartPrivacy page 31 | Effective 2026-07-01 | Normalized in `src/lib/quote/catalog/norman-2026.catalog.json`; pricing/rule tests exist | Retail grids are not the current 805 wholesale schedule |
| `NORMAN PRICING.pdf`, SHA `fdf0af…044` | Shows a 0.3000 dealer factor for 2-inch SmartPrivacy and 2-inch Ultimate and $25/$8 freight | Other-dealer capture dated 2026-07-20; no stated effective date | Pinned only as quarantined evidence with `runtimeAuthority: false` | It belongs to another dealer account and cannot authorize 805 cost |
| Current 805 Norman Roller fixtures and `docs/quote-v2/portal-parity/evidence/norman-roller-portal-capture-2026-07-21.md` | Exact current-account Roller evidence for 0.330 standard / 0.297 slower schedule, $25/$11 freight, and processing in the observed Roller recipe | Read-only unsubmitted draft captured 2026-07-21 | Normalized fixture and passing exact Roller parity tests | It proves Roller only; applying the factors to faux wood would be unsupported extrapolation |
| `Motorization Guide.pdf`, SHA `57692a…290` | Motor/power/controller restrictions and options | Effective 2026-05-11 | Normalized motorization rules/tests | Not wholesale authority for Phase 1 faux wood |
| Honeycomb, Roller, Roman, and Vertical product guides, SHAs pinned in the manifest | Product restrictions, assortment, and options | Current revisions from May through July 2026 | Normalized product catalogs/rules/tests | These are not wholesale authority for Phase 1 faux wood |
| `HC Color Coordination.xlsx` and `Roller MinMax Appendix.xls` | Honeycomb assortment/restrictions and Roller configuration boundaries | Honeycomb effective 2026-07-01; Roller appendix effective 2026-08-01 | Pinned workbooks and normalized rule fixtures | Not Phase 1 faux-wood cost evidence; Roller appendix must remain date-gated |

Phase 1 product findings:

- Norman SmartPrivacy 2-inch Pure White is a precise catalog identity. Pure
  White `P001` and its dimensional suggested-retail grid exist.
- Norman “Premium” is not the current source product name. The exact current
  product is Ultimate Cordless Faux Wood Blinds, 2-inch, Pure White `P001`.
- The earlier private figures derived with `(retail + option) × 0.3000` are
  test calculations from the other-account document, not current 805
  wholesale costs.
- Both Norman Phase 1 programs are loaded as
  `account_scope_unverified`, with no dealer-cost cells. They are not
  publishable or quote-ready until exact current-805 portal evidence covers
  those products and their selected options.

### Lotus

| Source | Coverage and authority | Effective/revision evidence | Current integration | Actual gap |
|---|---|---|---|---|
| `Lotus.pdf`, West A26.v1, SHA `4e9aba…982f` | Manufacturer dealer-net grids, restrictions, options, and freight terms | Modified 2026-04-01; no effective date stated | Normalized in `src/lib/quote/catalog/lotus-west-a26.catalog.json`; pricing tests exist | A source-effective date and exact requested product/color binding are unresolved |
| `docs/quote-v2/portal-parity/evidence/lotus-three-product-cart-2026-07-22.md` | Current 805 read-only cart observations for aluminum, Soft White faux wood, and a stock vertical | Captured 2026-07-22 | Retained as an exact portal comparison receipt | Observed Soft White `CFCX` is $105 in portal versus $53.97 in the book; it is not the requested Smooth Bright White program |

The book contains seven distinct custom faux-wood program choices plus stock
items. “Lotus standard 2-inch faux wood, white” is therefore not a unique
manufacturer configuration. The prior sample chose
`lotus_flx_2in_bright_white_custom` (Smooth Bright White, page 99). That exact
matrix has 119 cells: 111 priced dealer-net cells and eight explicit
unavailable cells. Its source grid can be normalized without inventing money,
but it remains `documented_not_published` because:

- the document states no effective date;
- “standard white” still needs an exact program/color decision;
- freight below the published free-freight threshold is unresolved;
- side-mount applicability/charges are not proved for the requested sample;
- a different faux-wood program has a current portal/book conflict; and
- the source does not define customer retail.

The Phase 1 review seed preserves all 119 cells, source page, SKU, availability,
and cell fingerprint. It does not make the program customer-sendable.

### Polar Shades

| Source | Coverage and authority | Effective/revision evidence | Current integration | Actual gap |
|---|---|---|---|---|
| `_Polar Shades Dealer Book - CURRENT.pdf`, SHA `52eb85…0b0e` | 246-page dealer book covering pricing, restrictions, assortment, options, and freight | File modified 2026-07-18; no effective date stated | Normalized in `src/lib/quote/catalog/polar-shades.catalog.json`; generators and pricing tests exist | Exact Elite book pricing conflicts with the current portal quote; restriction/freight closure is incomplete |
| `docs/quote-v2/portal-parity/evidence/polar-elite-portal-capture-2026-07-22.md`, private capture SHA `bca8fe…1a2` | Exact current-account, unsubmitted three-line Elite recipe | Captured 2026-07-22 | Retained as an exact non-PII evidence receipt and fail-closed parity fixture | Portal list is $905 per line while the pinned book routes the exact fabric to a conflicting $961 cell |
| Official-book Drapery Track and Premium Pro cases | Standalone book grids | Same pinned book | Normalized comparison fixtures | No exact current portal parity for these cases |

The Polar documents and imports exist. The current authoritative outcome is
deliberate quarantine for the conflicting Elite configuration, not a missing
catalog and not a usable wholesale version.

### Onyx Shutters

| Source | Coverage and authority | Effective/revision evidence | Current integration | Actual gap |
|---|---|---|---|---|
| `OnyxProgramBinder2020 (1).pdf`, SHA `eafb25…f26b` | Historical material/options/restriction reference | 2017 reference menu; file modified 2020-11-16; no effective date | Normalized shutter catalog/rule tests | It does not establish the current program revision or all current restrictions |
| `Onyx U.S. Made Vinyl Pricing 2026-07-20.png`, SHA `ffd0dc…4500` | $13.60/sq. ft. dealer cost, H2 included, H3 $1.00/sq. ft. | Received 2026-07-20; no effective date | Pinned pricing evidence and tests | It conflicts with current portal price and does not prove billable frame area |
| `Onyx US Made Vinyl Portal 2026-07-22.png`, SHA `8396fc…7eaf` and `docs/quote-v2/onyx-live-portal-audit-2026-07-22.md` | Exact current-805 30 × 72 U.S. Made Vinyl fixture: 17.564 portal sq. ft. and raw $239.749 | Captured 2026-07-22; no stated price-book effective date | Retained exact portal fixture; engine emits a source-conflict hard block | Reconciles to $13.65/portal sq. ft., conflicting with $13.60; a general frame-area rule and customer retail remain unproved |

Onyx source evidence exists and is intentionally preserved on both sides of
the conflict. It is not quote-ready and is not silently corrected with a
one-off adjustment.

## Database and active-route state

The protected production schema already has V2 catalog-version and price-
snapshot concepts, but no reusable
`sales_quote_v2_wholesale_versions` ledger is deployed. The live production
workspace also does not currently expose the V2 manufacturer chooser or Lotus
configuration in the observed draft, and its legacy browser pricing path does
not query a wholesale authority.

The isolated implementation adds:

- indexed, internal-only source/version/program/grid/option/order-cost tables;
- review, publish, quarantine, and retirement lifecycle rules;
- immutable published versions and immutable quote snapshot references;
- a service-role-only published wholesale lookup;
- database verification that replays the indexed lookup before accepting a
  ledger-priced immutable snapshot;
- a CRM-authenticated Mike/Jessica server adapter that hardcodes the `805`
  account scope and rejects all client-supplied cost/provenance/version fields;
- a deterministic Phase 1 review seed for the documented Lotus grid and
  blocked Norman program identities.

No migration has been applied and no version has been published. This preserves
the immediate V1 rollback and prevents incomplete evidence from pricing a
customer quote.

## Exact Phase 1 release gates

1. Resolve the Lotus configuration label to one exact manufacturer
   program/color and review current-effective, freight, side-mount, and portal
   evidence.
2. Capture exact current-805 dealer-cost observations for Norman SmartPrivacy
   2-inch Pure White and Ultimate 2-inch Pure White, including applicable
   options. Do not reuse the other-account 0.3000 factor or Roller factors.
3. Reconcile every source conflict without overwriting either artifact.
4. Review the normalized version, populate only source-evidenced option and
   order-cost rows, set an explicit effective period, and publish via a
   separately authorized migration/operation.
5. Connect active authoritative repricing to the server lookup and snapshot the
   returned wholesale version/fingerprint. Any absent program, unavailable
   grid cell, unresolved order cost, or unpublished version must block.
6. Prove that internal cost/margin is absent from customer APIs, public quote
   payloads, logs, and browser caches.
