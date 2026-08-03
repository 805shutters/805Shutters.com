# 805 Quote System V2

## Scope and safety boundary

V2 is developed on the isolated `codex/quote-system-v2` branch and worktree.
It must not write to the production Supabase project, send customer messages,
create payments, or submit manufacturer orders during development.

The protected `/quote-lab` preview mounts the existing production
`QuoteBuilder` and its CSS. It does not introduce a replacement workspace,
comparison panel, or alternate quoting workflow. The only visible differences
allowed are contextual fields that the manufacturer documentation requires.

Test data is supplied through the existing database-shaped UI adapter and is
durably stored in a separate SQLite test database behind the Quote Lab access
gate. No production credentials or rows are used. The path defaults to the
server's temporary test area and can be pinned with
`QUOTE_V2_TEST_DATABASE_PATH`; optimistic revisions reject concurrent stale
writes. Production migrations remain a separate cutover step.

## Interface contract

- Preserve the existing layout, styling, room presets, product ordering,
  design alternatives, measurement workflow, discounts, and totals.
- Use the established room names. Never synthesize `Room 1` through `Room 40`.
- Permit at most 40 measured-window line items. Quantity remains independent;
  adding a 41st stored line item fails.
- Require exactly one selected design per line. Saved alternatives do not add
  to the quote total.
- Reject malformed fractions and non-positive or non-integer quantities before
  selection fingerprinting; V2 never repairs those values into a priceable
  input.
- Roman, Honeycomb, and Vertical side-by-side configurations select the exact
  partner by quote-line ID. The interface maintains reciprocal references, and
  the server derives match evidence only after comparing both selected lines.
- Show only customer retail in customer-facing payloads. Dealer cost, freight,
  multipliers, and margin stay authorization-protected.

## Catalog status contract

Every product has exactly one status:

- `complete` - normalized pricing and restriction evidence is complete.
- `documented_limited` - sendable only within the exact normalized and tested
  configurations; undocumented branches fail closed.
- `manual_quote_required` - cannot be authoritatively priced automatically.
- `restriction_source_incomplete` - price data may exist, but the restriction
  evidence is not complete enough for customer sending.
- `unavailable` - not selectable for a new quote.

Only `complete` and `documented_limited` configurations can be customer
sendable. An unknown product or status is treated as
`restriction_source_incomplete`, never implicitly permitted.

## Source authority and reproducibility

The immutable source registry is
`src/lib/quote-v2/source-manifest.ts`. The companion binary identity lock is
`src/lib/quote-v2/source-artifacts.lock.json`. Each source is pinned by source
ID, exact filename, revision, effective date evidence, byte length, and
SHA-256. A replacement document requires a new source/catalog version; a hash
must never be edited in place to accept different bytes.

The vendor source set is intentionally kept in an external immutable source
vault rather than Git because it is approximately 150 MB and contains licensed
vendor PDFs, including a 109 MB Polar dealer book. Generated catalog data,
source-cell lineage, hashes, and the verification lock remain source
controlled. Verify a retained vault with:

```bash
npm run quote-v2:sources:verify -- --source-dir /absolute/path/to/source-vault
```

Multiple `--source-dir` arguments are allowed, or set
`QUOTE_V2_SOURCE_DIR` to a platform-delimited directory list. Verification is
strict: all 12 exact filenames, byte lengths, and hashes must match.

Both workbook generators reject unrecognized source bytes before generating
catalog code. Roller generation also pins the deterministic LibreOffice XLSX
conversion hash as a derived artifact.

Source precedence is explicit:

- Price books control dollars and price groups.
- Product guides control dimensions, fabrics, options, and restrictions.
- The newer July 2026 Retail Guide wins the ten Roman price-group conflicts:
  Sheer Elegance `F1085`, Valencia `F0255`, and Sierra `F1916` through `F1923`.
- Dealer websites are read-only parity evidence, never a runtime dependency.
- A source conflict quarantines only the affected option until resolved.

The current 805 Norman account was checked with a temporary, non-submitted
Roller fixture: Brook `F1120` Pewter at 24 by 36 inches with SmartRelease and
one shim. The portal showed $350 configured list/MSRP, $115.50 standard-schedule
dealer merchandise, $25 freight, and $2.81 processing. A separate historical
Amelia/Raceway fixture belongs to another dealer account and remains
quarantined. These fixtures verify only their exact configurations; broad
pricing and allow/block portal parity remains a production-cutover gate.

## Authoritative pricing lifecycle

One server engine must serve option filtering, pricing, saving, repricing, and
sending. A complete `SelectionContext` is validated before pricing. Unknown
codes, incomplete configuration, missing provenance, stale snapshots, and
unsupported motor configurations fail closed.

Every successful price stores the catalog version, selected-design identity,
selection fingerprint, validation result, customer retail breakdown, and an
authorization-protected landed-cost breakdown. A dimension, fabric, lift,
motor, or configuration edit clears the current authoritative price until
repricing succeeds. Historical quotes retain immutable snapshots; they are not
silently repriced.

Customer retail follows the effective source price basis for the selected
manufacturer program. `suggested_retail` programs preserve the price-book or
portal MSRP components and apply customer discounts to that retail ledger.
`dealer_net` programs do not invent customer retail; they fail with
`CUSTOMER_RETAIL_UNDEFINED` until an explicit, authoritative retail policy is
versioned for that manufacturer and product. Lotus is now explicitly
owner-authorized per independent product model at three times source wholesale.
Dealer factors are used only for the protected internal merchandise-cost
ledger. Published shipping, freight, and oversize
charges are allocated into internal line-item landed cost and are not added
again as customer retail. An estimated freight value is internal-only and must
be explicitly labeled estimated.

## Intentional fail-closed areas

- Motorized Honeycomb and Roman configurations use the pinned July 2026 Norman
  Motorization Guide for exact motor-family compatibility, power source,
  controller family, motor position, accessories, and dimension/area limits.
  Missing or unsupported evidence is a structured hard block. Shared Norman DC
  panels (up to 12 motors) and Automate panels (up to 18 motors) remain blocked
  until quote-level shared-accessory allocation can prove one correctly priced
  panel without duplicating it across lines.
- Honeycomb Patio Door Vertical uses the documented 24-inch minimum height;
  dimensions below that minimum fail closed.
- Roman Caroline `F1090` remains quarantined while the guide-versus-dealer
  catalog style conflict is unresolved.
- Honeycomb `Whispers` remains unavailable as stale workbook residue.
- The Roller MinMax Appendix is preview-testable with an injected date but is
  not production-active before August 1, 2026.

## Send and cutover gates

Sending must revalidate every selected line against the same catalog revision
used for its immutable snapshot. The whole quote is rejected if any line is
stale, incomplete, unsupported, unpriceable, missing a selected design, or has
customer-visible internal cost fields.

V2 is not eligible for production cutover until all of the following pass:

1. Source hash, revision, inventory-count, discontinued-identity, and workbook
   reconciliation tests.
2. Generated boundary and regression tests for every normalized restriction.
3. One-, 40-, and 41-line-item tests, room-name behavior, selected-design-only
   totals, stale-price clearing, save/reload, discounts, and freight allocation.
4. Zero-cent pricing and identical allow/block outcomes against representative
   current manufacturer ordering-site fixtures without submitting orders.
5. Visual regression acceptance against the existing quoting interface.
6. Production send-path integration tests proving full V2 revalidation and
   customer payload cost exclusion.
7. A separately configured test data target for any persistent schema changes.

Cutover is a separate, explicitly approved change. The existing system remains
the immediate rollback path; `main` and production data remain unchanged while
V2 is under development.

## Focused verification

```bash
QUOTE_V2_SOURCE_DIR=/absolute/path/to/source-vault npx vitest run \
  src/lib/quote-v2/source-manifest.test.ts \
  src/lib/quote-v2/source-artifacts.test.ts \
  src/lib/quote-v2/source-generator-guard.test.ts \
  src/lib/quote-v2/roman-price-group-precedence.test.ts
npm run typecheck
```
