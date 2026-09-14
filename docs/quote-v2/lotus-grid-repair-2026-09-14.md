# Lotus grid routing verification — September 14, 2026

The current and V1 quote interfaces now route all five Lotus product families
through the same exact catalog pricing engine. The selected program retains its
own width/height axes, unavailable cells and retail policy. Lotus selections do
not use Norman category defaults or automatic option surcharges. Invalid edited
dimensions clear the old calculated price. Existing manual/locked price guards
remain in the surrounding editor flow.

All five families have Lotus program controls. The existing current Faux Wood
panel is retained; V1 also records each width for a three-blind opening. Program
changes clear prior manufacturer options and require an explicit program when
multiple programs exist.

## Independent source check

Ran the existing hash-checked importer with `--check` against the original
`/Users/michaelshepard/Documents/805-quote-v2-sources/Lotus.pdf`. It passed without
writing the catalog: 113 pages, 5 products, 3,206 stock records, 1,494 priced
matrix cells and 86 blocked cells. Source SHA-256:
`4e9aba91a601e1212a3e8a1531c361caf033c28ef6ca1fdac3ad6247502a982f`.

The existing owner-approved policies remain unchanged: 3x wholesale generally,
2.5x for FTX Snow White, and an independent Blackout program using the approved
1% roller wholesale cells.

## Remaining source limitations

Customer delivery still blocks FLX and FCX source price conflicts, unsupported
Side Mount fitment, and vertical vane per-piece/casepack ambiguity. The FLX
observations are recorded in `lotus-authority.ts`; the FCX observation is
`CFCX4872W` in the July 22 three-product portal cart fixture ($105 portal versus
$53.97 book). These historical observations were not refreshed at the portal.
Other Lotus family restriction statuses remain unchanged; exposing draft grid
pricing does not claim complete ordering/fitment authority.

## Regression coverage

Both interface adapters are checked against every catalog cell, the next cell
after a 1/16-inch boundary, hardcoded source golden values for all five families,
FTX splits, missing/mismatched identities and unavailable dimensions. UI tests
render all five family selectors and verify manufacturer-change state clearing.
Source guard tests distinguish unaffected FTX from FLX/FCX, Side Mount and vanes.
