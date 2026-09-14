# Manufacturer quote repair — September 14, 2026

## Scope and release state

Base: freshly verified origin/main `0feafb9ca98d1b5112f0e7cddf0ea78944a678b7`.
Isolated integration checkout: `805-manufacturer-quote-repair`.
Canonical dirty checkout is untouched. Local implementation only; no production
records, customer communications, push, deployment, or production migrations authorized.

## Work tracker

- [x] Reconcile five manufacturer audits with current main and isolate changes.
- [x] Norman invalid measurement/fabric handling and Onyx V1 frame geometry.
- [x] Polar product-specific readiness, fabric/group validation, exact V1 routing.
- [x] Lotus five-family grid routing, preserving source-specific conflicts.
- [x] Sundance source imports, distinct identities and explicit activation gates.
- [x] Versioned fixed customer charges, discounts, customer and CRM projections.
- [x] Integrate V1 automatic charge hooks and fee SQL persistence verification.
- [x] Run integrated browser, full suite, typecheck and production build.
- [x] Record final evidence and remaining manufacturer authority blockers.

## Policy

Each physical blind or shade receives $25 installation plus $14 shipping after
merchandise discounts, multiplied by component count and line quantity. These are
customer charges, separate from dealer costs and manufacturer freight. Shutters,
accessory-only products, and manual prices are excluded. Existing snapshots carry
no new charges unless an unsent draft is explicitly recalculated. Opening a priced
quote must not update it. Fixed components are versioned as
`blind-shade-install-ship-v1`; unit price already includes the per-window fixed
amount. Totals never add that amount a second time.

## Manufacturer evidence and remaining authority

| Manufacturer | Local repair | Source limitations that remain |
| --- | --- | --- |
| Norman | Positive finite dimensions, grid maxima, no unknown-fabric cheapest fallback, stale-price invalidation, edit-only recalculation | Existing July/Fall catalog sources retained. Current source-restriction gates stay in force. |
| Onyx | V1 source-derived frame-adjusted billable size; original opening preserved; supported program aliases normalized | V2 current-source/max-panel-area evidence, retail option charges and vinyl rate conflict remain unresolved. Blocked configurations are not activated. |
| Polar | Per-product readiness, fabric-to-program validation and draft grid routing in both interfaces | Interior/drapery/awning restrictions remain incomplete; tension/manual products remain manual. Exact Elite portal/book price conflict remains blocked. |
| Lotus | All five families use exact Lotus grids; 3× policy and FTX Snow White 2.5× exception retained | FCX and FLX cart/book discrepancies, Side Mount source conflict, ambiguous vane units and incomplete non-faux restriction coverage remain scoped gates. |
| Sundance | 18 freshly fetched source PDFs match pinned hashes; 28 families, 98 grids, 18,711 numeric cells imported with actual axes | Dealer pricing authority, unresolved options/restrictions and missing family books/rates prevent automatic activation. Verified source import is not a completed automatic-quoting repair. |

Manufacturer-specific details: `lotus-grid-repair-2026-09-14.md` and
`sundance-2026-09-14.md`. No manufacturer is deployed or verified live by this work.

## Verification evidence

- Source artifact verification: **39/39 pinned binaries** passed byte-size and
  SHA-256 checks. This proves pinned source identity, not that unresolved dealer
  terms have been reconciled.
- Polar: all **79 programs** exercised at minimum/middle/maximum headers, exact
  boundaries and boundary plus 1/16 inch. Dealer-net-only cells stay separate from
  retail; missing cells and out-of-axis dimensions fail.
- Sundance: all **98 grids** have structural/provenance validation and 196
  boundary tests, alongside 12 independent source golden fixtures. The exhaustive
  sweeps compare against imported matrices; they are not 98 independently audited
  dealer-portal quotes.
- Lotus: original 113-page source importer reproduced the catalog without edits;
  all 20 grid programs, 1,494 priced cells and 86 blocked cells are covered through
  both interface adapters, alongside stock records and five-family source fixtures.
- Native SQL tests execute actual pricing, snapshot preparation and manual-price
  wrapper functions in a local PostgreSQL-compatible database. They verify
  revisions, replay handling, immutable snapshot preservation, saved CRM mirrors,
  corrupted-charge rejection and $387 before tax for the stated example.
- Customer output tests deserialize saved line data, project selected physical
  units, and render the actual customer contract/print component: three $25
  installation entries, three $14 shipping entries and $387 total. PDF download
  or authenticated production persistence is not claimed.
- Browser tests use real current/V1 editor components with local persistence and
  all external/API requests blocked. They cover saved reload, historical opens,
  invalid edits, rapid edits, quantities, fractions and manufacturer routing.

All new migration versions are newer than the unchanged remote main head checked
on September 14. None has been applied to production. A release still needs the
separately authorized publishing step, pipeline/deployment provenance verification
and authenticated persistence checks.

## Final local result

- `npm test -- --maxWorkers=4`: **451 files passed, 3,883 tests passed**;
  five files / 28 tests remain skipped by their existing configuration.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Playwright current/V1 regression suite: **18 passed**. This includes saved
  alternatives and locked-view no-write checks, and a Lotus 90-inch mini blind
  that is valid in its own grid but exceeds Norman's 78-inch one-inch-slat limit.
- `git diff --check`: passed. No new duplicate migration versions. Three older
  duplicate-version pairs already exist on origin/main and were left untouched;
  publishing must use the existing controlled migration pipeline.
- Desktop/iPad screenshots were generated and the iPad saved-state image reviewed.

The requested automatic-quoting outcome is **not fully complete for all five
manufacturers**. The local implementation is tested, but the source limitations
listed above remain blockers. Closing them requires current manufacturer/account
pricing evidence: Onyx rates, panel limits and option charges; Polar disputed
Elite price and missing product restrictions; Lotus disputed program prices,
fitment and vane units; Sundance approved account pricing and complete family
configuration rules. No source-specific gate was removed to manufacture a pass.

| Manufacturer | Pinned source checked | Local regression tests | Deployed | Authenticated live persistence |
| --- | --- | --- | --- | --- |
| Norman | July/Fall artifacts verified; existing limits retained | Passed, including fabric-limit invalidation | No | No |
| Onyx | Pinned references checked; current authority gaps remain | Passed for frame geometry and block behavior | No | No |
| Polar | Pinned book verified; specified conflicts remain | Passed for all 79 program lookups and routing | No | No |
| Lotus | Original importer reproduction verified; specified conflicts remain | Passed for all five families and component fees | No | No |
| Sundance | 18 source documents verified; pricing authority incomplete | Passed for 98 evidence grids and manual gates | No | No |
