# Quote V2 fresh manufacturer-order parity rerun — 2026-07-22

**Internal testing only — dealer cost data.**

## Pre-fix verdict

**Grade: D+**

The authoritative backend is materially stronger than the previous build, but the current Quote Lab is not usable for its primary job: a salesperson cannot take a truly blank quote through manufacturer selection and authoritative pricing. Seeded-state tests pass because those designs already contain manufacturer and catalog IDs.

No manufacturer order was submitted, no customer quote was sent, no production database was touched, and no production deployment was performed.

## Post-fix rerun

**Honest current grade: B-**

The two fresh-interface blockers documented below are now fixed for the verified Norman Roller path. Starting from a server-generated blank quote, the existing line-item header can select the manufacturer/product without seeded state or API injection. The visible interface then completed this exact configuration:

- Norman Roller, 24 × 36
- Brook F1120, Pewter
- Inside Mount, Single Shade
- No Top Treatment
- Smart Release, with the documented 1¾-inch tube derived automatically
- Shim: Yes

The authoritative result was $350 customer retail with the complete component ledger: $254 base, $0 fabric, $7 accessories, and $89 operating system. Wholesale cost was $115.50 and allocated landed cost was $143.31. The protected Chromium suite passed 10/10, including save/reload persistence of the fresh quote.

This is a verified fresh-interface pass for the supported Norman recipe, not overall manufacturer parity. Polar, Lotus, and Onyx remain source-incomplete or portal-conflicted as documented below, so this rerun does not justify an A grade or make those manufacturers customer-sendable.

## Fresh-test boundary

- Branch/worktree: `codex/quote-v2-a-grade` in the isolated integration worktree.
- Database: a new local SQLite file dedicated to this rerun.
- Every unlock receives a random HttpOnly workspace nonce.
- Every fresh run server-generates a unique run ID and empty `V2-<uuid>` quote.
- New measured-line IDs and timestamps were generated through the visible existing-interface controls.
- Catalog test date: `2026-08-01`. This is the approved Roller appendix preview date, not proof of July 22 production parity.

## Automated results

| Gate | Result |
|---|---:|
| Immutable source artifacts | 14/14 verified |
| Quote V2, Quote Lab, and protected API tests | 431 passed, 1 skipped |
| Fresh portal-order replay recipes | 12/12 passed |
| Norman 20-quote × 20-item progressive component matrix | 400/400 priced lines passed |
| Protected existing-interface browser suite | 9/9 passed |
| TypeScript | Passed |
| Production build | Passed |
| Full repository unit suite | 1,449 passed, 5 skipped, 1 unrelated Mobile Appointment source-contract failure |

The browser suite now works from both `localhost` and the currently used `127.0.0.1` local preview. Its first rerun exposed Secure-cookie behavior on local HTTP; the isolated Quote Lab cookie logic was corrected and the full 9-test suite then passed on `127.0.0.1`.

## Replayed manufacturer configurations

| Manufacturer/order | Fresh V2 result | Assessment |
|---|---|---|
| Norman Roller, 24 × 36, Brook F1120 Pewter, SmartRelease, one shim | $350 customer retail; $115.50 product cost; $25 freight; $2.81 processing; $143.31 landed cost | Exact backend parity and sendable |
| Norman historical RR002, 36 × 60 Amelia RD F1774, cord loop, raceway | $451 customer retail; $148.83 product cost at current .330 schedule; $177.31 landed cost | Current-policy backend parity and sendable; old .300 cost rejected |
| Polar quote 166382, three Elite shades | $0; all three lines blocked on `polar.elite.portal_book_price_conflict` | Correct fail-closed behavior, but no price parity because portal $2,715 conflicts with book $2,883 |
| Lotus three-line authenticated cart | $0 customer total; CAMX $27.84 and faux $53.97 book costs retained; stock vertical unresolved | Correct fail-closed behavior; faux portal/book conflict and missing customer-retail authority remain |
| Onyx 30 × 72 U.S. Made Vinyl, 3½-inch louver | $0; blocked on live price and restriction-source conflicts | Correct fail-closed behavior, but no price parity |

Only the two Norman recipes currently prove a sendable manufacturer-to-V2 result. Polar, Lotus, and Onyx demonstrate safe blocking, not completion.

## Critical fresh-interface failures

### 1. A blank quote cannot choose a manufacturer

Reproduction through the visible interface:

1. Reset to a server-generated empty quote.
2. Add `Roller Shades` → `Living Room`.
3. Enter 24 × 36.
4. Select Inside Mount.

The new design is saved with `supplier: null` and no catalog product/program ID. The manufacturer stamp and product chooser both have a count of zero. Pricing correctly fails closed on `common.program.required`, but the interface provides no way to supply the missing manufacturer/program.

Root cause: the manufacturer chooser is rendered only when `resolveManufacturerStamp()` already returns a manufacturer. A fresh design needs the chooser in order to establish the value required to render the chooser.

This affects fresh products generally, not only Roller Shades.

### 2. Fresh SmartRelease configuration becomes impossible even after catalog identity is supplied

For diagnostic separation only, the Norman product/program identity was inserted into the new design through the protected test API. All remaining choices were then made through the visible interface:

- Application: Single Shade
- Shade type: Single Shade
- Fabric: Brook F1120 Pewter
- Lift system: Smart Release
- Top treatment/valance: no treatment
- Shim: yes

The UI auto-derived `All Tubes`, hid the tube selector, and the authoritative backend rejected the line with:

> No exact Roller matrix profile matches the selected operating system, orientation, top treatment, and tube.

Changing the choice order did not expose a valid 1¾-inch tube path. The exact same portal configuration prices correctly at $350 when the complete authoritative selection is supplied directly, proving the grid/component arithmetic is sound and the visible dependency flow is the blocker.

### 3. Seeded browser tests overstate fresh-quote readiness

The existing manufacturer-switch and Cordless-to-Motorized browser tests pass, including the $328 → $494 AutoWand reprice, component explanation, red wholesale-cost highlighting, save/reload, and cleanup. Those tests start from designs that already have Norman product/program identity. They therefore do not cover the blank-quote manufacturer dependency above.

## Confirmed component arithmetic after controlled identity injection

The new 24 × 36 line rendered:

- Base grid: $254
- Fabric upgrade: $0
- Accessories: $7
- Operating system: $89
- Customer total: $350
- Product cost: $115.50
- Allocated freight: $25.00
- Allocated processing: $2.81
- Landed line cost: $143.31

Wholesale values rendered in the required red treatment, and customer-facing projection tests confirmed that dealer cost, freight cost, processing, margin, and wholesale fields are excluded.

This controlled injection is diagnostic evidence, not a fresh-interface pass.

## Required fixes before the next grade

1. Render an empty-state manufacturer/product chooser for every fresh design; never require a preexisting manufacturer stamp.
2. Make Roller dependent fields deterministic and reachable. Smart Release must expose or correctly derive its documented tube/profile, and changing valance/top treatment must not silently replace it with an invalid value.
3. Add a browser acceptance test that builds the Norman SmartRelease portal recipe entirely from a server-generated blank quote with no API fixture patch.
4. Add the same fresh-interface recipe test for Polar, Lotus, and Onyx, expecting authoritative hard blocks until their source conflicts are resolved.
5. Separate current-day catalog acceptance from the injected August 1 appendix preview before production cutover.
6. Resolve Polar portal/book pricing, Lotus retail/stock/conflict authority, and Onyx live price/restriction authority before those manufacturers can count as parity passes.

The next meaningful retest starts with the two blank-quote blockers. Until both pass without state injection, the build should remain isolated and must not replace the current quoting system.
