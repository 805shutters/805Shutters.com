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
- [ ] Integrate V1 automatic charge hooks and fee SQL persistence verification.
- [ ] Run integrated browser, full suite, typecheck and production build.
- [ ] Record final evidence and remaining manufacturer authority blockers.

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
