# Quote V2 immutable source closure — 2026-07-22

This record documents the source set used by the isolated Quote V2 build. It
does not authorize a production cutover or silently replace any pinned source.

## Verification result

The repository verifier passed all 14 pinned artifacts in the external,
read-only source vault:

```text
npm run quote-v2:sources:verify -- --source-dir /Users/michaelshepard/Documents/805-quote-v2-sources
Verified 14 immutable Quote V2 source artifacts.
```

The set includes the Norman July Retail Guide, Honeycomb/Roller/Roman/Vertical
product guides, May Motorization Guide, Honeycomb color workbook, August 1
Roller MinMax Appendix, Lotus and Polar books, Onyx binder and two pricing
fixtures, and the retained Norman dealer-pricing snapshot. Runtime and tests use the
source IDs, hashes, revisions, and effective dates in
`src/lib/quote-v2/source-manifest.ts` and
`src/lib/quote-v2/source-artifacts.lock.json`.

## Reconciled source identities

- `Motorization Guide.pdf`: 9,323,825 bytes; SHA-256
  `57692a04ac4abe2e8774f8b248f4516141929124580edc2527e85f29d4feb290`.
- `Roller MinMax Appendix.xls`: the current official 696,832-byte download is
  byte-for-byte identical to the pinned SHA-256
  `ba286767b6c4d760bf480434312678f6c35b229e9763ddd6fcda9f7cd18b9cc3`.
  Older 706,560-byte Downloads copies must not drive V2 rules. The pinned
  appendix becomes production-effective on 2026-08-01 only.
- `HC Color Coordination.xlsx`: the pinned 131,900-byte workbook remains the
  reproducible catalog source. Norman's 2026-07-22 endpoint returned different
  package bytes, but a read-only workbook comparison found zero value, formula,
  sheet, range, validation, filter, style, or dimension differences. Those new
  bytes were not substituted silently.
- `Onyx U.S. Made Vinyl Pricing 2026-07-20.png`: 45,282 bytes; SHA-256
  `ffd0dc5d5a337a7a6a4a3ec55446119cb596445b04816afa095af4b0e9e94500`.
  It proves dealer cost `$13.60/sq. ft.`, H2 tilt included, and H3 hidden gear
  `$1.00/sq. ft.` only.
- `Onyx US Made Vinyl Portal 2026-07-22.png`: 73,462 bytes; SHA-256
  `8396fc5fadef32982a5731ce007e2b41d133de038f769d00ac44681f037f7eaf`.
  The redacted current-account fixture proves `$239.749` on `17.564` portal
  square feet for a 30 × 72 VL Outside line, which reconciles to `$13.65` per
  portal square foot and conflicts with the supplied `$13.60` screenshot.

## Deliberate fail-closed boundaries

- The Onyx artifacts conflict on both active rate and billable-area basis. They
  do not prove a customer MSRP, current dimensional restrictions, a general
  frame-area formula, or an effective program revision. Onyx customer pricing
  and current-cost authorization stay blocked.
- A source hash proves document identity, not manufacturer-portal parity.
  Products and options with unresolved book-versus-portal conflicts remain
  quarantined or manual-quote-only.
- The August Roller appendix may be exercised with an injected preview date,
  but production code must resolve its date in `America/Los_Angeles` and must
  not activate it before local midnight on 2026-08-01.
