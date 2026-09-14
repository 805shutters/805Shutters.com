# Local manufacturer quote regression coverage

The local harness mounts the actual current and V1 CRM design cards, copy helpers,
customer detail helpers, and line-total helpers. It persists synthetic design and
measurement state in browser localStorage. Every non-local request and every
`/api/` request is aborted. These tests do not certify a deployed application or
exercise production records, authentication, order placement, or send actions.

## Run

```sh
node node_modules/vite/bin/vite.js --config e2e/norman-fall.vite.mjs
E2E_BASE_URL=http://127.0.0.1:4193 npx playwright test e2e/norman-fall.local.spec.ts e2e/manufacturer-quotes.local.spec.ts
```

## Assertions

- Norman current and V1, desktop and iPad: select F2221/Springtide from all 440
  available fabrics, preserve selection and copy metadata, reject width 98 against
  the fabric's 96-inch maximum, recover to width 36, round 36 1/16 to the 42-inch
  grid column, and settle correctly after rapid width edits.
- Norman 36 x 60: $517 source merchandise less 10% is $465.30; installation $25
  plus shipping $14 yields $504.30 per shade. Quantity three totals $1,512.90,
  including $75 installation and $42 shipping.
- Lotus FTX: three separately measured 31.5 x 34.25 blinds resolve to three
  35 x 36 cells, $202.35 merchandise per opening. A 10% line discount rounds to
  $20.24, then three $39 charges yield $299.11 per opening. Quantity two totals
  $598.22, including $150 installation and $84 shipping for six physical blinds.
  Invalid height clears the price and valid height restores it.
- Sundance retains its exact manufacturer/product/program identity and explains
  the pending account-factor, retail/net, and configuration authority. No Norman
  price is substituted. The 98 imported source grids remain evidence-only.
- Polar Tension Shades retain their manual-only route and have no invented price.
- Onyx missing frame geometry blocks pricing after a measurement edit.
- Both interfaces reopen previously saved prices without any pricing write or
  newly added fee; locked and manual values remain unchanged.
- Customer details show installation and shipping; internal catalog and pricing
  metadata stays hidden. Norman layouts have no horizontal overflow and produce
  desktop/iPad screenshots in the Playwright test output directory.

The separate Sundance catalog tests sweep minimum/middle/maximum cells and
one-sixteenth-inch boundaries in all 98 imported grids, including every missing
cell. These imported-data checks supplement 12 independently pinned PDF golden
fixtures; they are not 98 independent PDF golden verifications.

## Final run

18 tests passed on September 14, 2026 in the isolated integration checkout.
Both interfaces additionally verify saved alternative selection and no writes
when viewing an alternative on a locked quote. Lotus mini-blind edits retain
Lotus identity and use its own grid limits; an unavailable cell clears the price
and shows its exact source lookup failure before valid measurements recover.
