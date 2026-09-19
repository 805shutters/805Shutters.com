# Norman catalog implementation and verification ledger — September 18, 2026

Status: implementation in progress. This ledger does not certify universal live pricing.

The current catalog contains 16 Norman families and 50 programs, including two newly discovered San Clemente families and their three unpriced programs. The original import contained 14 families and 47 programs. A fresh comparison of the current catalog against the pinned September retail PDF matched all 371 rows across the 41 non-shutter programs, including unavailable cells. The six shutter rates remain provisional because the supplied binders leave the base-rate fields blank. Matching a retail grid does not establish configuration eligibility or 805 dealer cost.

The inventory includes 1,299 retained fabric/color identities, of which 1,289 are available to the picker; 678 Honeycomb color/cell routes; and 555 configuration-field, surcharge and motor-accessory records. These are inventory counts, not a claim that every option combination is supported. Authenticated dealer discovery continues; San Clemente was absent from the original import.

## Implemented changes

- San Clemente: add separate HG006 Light Filtering, HG006BO Room Darkening and B5W20 Faux Wood destinations, all ten current G2 fabrics and White 6008. Dedicated CRM controls preserve product identity, net dimensions, two cordless honeycomb lifts, depth, fixed faux-wood slat/wand/valance, bracket conditions and optional pole quantities. Source-backed configuration is available; prices remain blocked until the San Clemente base and surcharge schedules are supplied.

- Pin September 10 SmartFold guide and size appendix, August 1 CityLights guide, September 1 Normandy wood-blind guide, and September 16 motorization guide. The 45 initial manifest artifacts were hash-verified against local originals; the newly downloaded San Clemente PDF is also hash-pinned.
- Retain existing catalog IDs. Keep discontinued colors and SmartFold reverse-side image identities readable. CityLights half-inch configurations are discontinued from August 1.
- SmartFold: 15 ordering fabrics, collection/control-specific appendix limits, Louise cordless height of 72 inches, narrow cordless limits, fold-height constraints, tall-Louise valance requirements, inside-only Light Guard, and three valance price schedules. October-specific motor revision remains date-controlled.
- SmartDrape: add F1603, F1604 and F1868; route the ten Essentials fabrics to their source grid; enforce motor/stack/mount, pocket, area, left-motor location, wall hardware and keystone conditions. Derive shim quantity by mounting-bracket count, with separate manual/motorized breakpoints. The uncovered motorized center-opening bracket interval over 94¼ through 94½ inches is blocked for manufacturer clarification.
- New Norman quote: explicit desktop entry point creates a server-owned draft through the existing authenticated API and preserves a stable request key on retries. Existing drafts retain their original pricing mode.
- CityLights and wood side-by-side pairs: validate reciprocal saved line references, actual ordered height, mount, slat size and exact color code; one-inch CityLights also requires matching route type. Rules are effective-date controlled.
- CityLights: reconcile 30 one-inch and 22 two-inch colors, derive finish charges from the color code, enforce net dimensions and narrow-blind center tilt, and reject incompatible controls/side brackets.
- Wood cut-outs: retain each side, corner/middle type, width and headrail-referenced heights. Enforce slat-specific dimensional limits, derive the $99-per-side surcharge, clear obsolete measurements, preserve customer-visible measurements and verify serialization. Common-valance cut-outs remain an explicit assembly exception.
- Wood blinds: derive designer/premium charges by code, provide priced Designer Crown/Contempo/Linear valances, and enforce net dimensions and narrow center tilt. Add dealer-guide ND108 Rustic Gray. Retain conflicting legacy ND118 as unavailable for new ordering without rewriting historical quotes.
- Palladian Shelf: expose the product, require source-listed finish, valid depth and inside mount, and link a selected eligible Norman product across different line families for the with-product grid.
- Roman: price both common-valance shade widths independently and preserve both motors. Fabric width and manual area checks apply to each shade rather than the whole opening.
- Shared motorization: derive versioned assembly/accessory records on the server; discard client-supplied allocations; enforce compatible family and panel capacity; charge the panel once across line quantities; reassign its owner when the former owner is removed. Mixed large dual-motor Honeycomb loads remain blocked pending manufacturer guidance.
- Derive and persist 36W/65W adapter requirements across supported Honeycomb, Roman and SmartFold lines, preserving the narrow dual-motor Honeycomb exception. Unknown DC power-source labels are rejected.
- Keep dealer cost, suggested retail, customer selling policy and saved snapshots separate. No selling-price policy change was made.

## Family exceptions

| Family | Unresolved before complete live certification |
|---|---|
| Honeycomb | Remaining specialty and Day & Night combinations, complete shared-accessory rules, current dealer comparisons and production persistence. |
| Vertical Honeycomb | Full vertical operating, stacking and rail configuration rules; manual-quote gate retained. |
| Roller | Remaining dual/common-valance/coupled accessories; current dealer and production comparisons. |
| Roman | Remaining accessory combinations; current dealer comparison and actual production save/reopen of common valance and shared panels. |
| SmartFold | Multi-shade common-valance model and complete mounting/accessory combinations; current dealer and production comparisons. |
| PerfectSheer | Motor tube/factory AA-fabric-to-F-color mapping, complete mounting/valance combinations and dealer comparison. |
| SmartDrape | Complete motor/accessory contract, track extensions and conflicting bracket interval; dealer and production comparison. |
| CityLights | Complete mounting and multi-blind side-by-side groups beyond pairs; current dealer and production comparison. |
| Wood Blinds | Common valances and their outer-position cutouts, keystone locations and complete mounting constraints; account reconciliation of ND108/ND118. |
| Ultimate Faux Wood | Complete current assortment/options and current dealer/production comparison beyond the existing documented subset. |
| SmartPrivacy Faux Wood | Complete current assortment/options and current dealer/production comparison beyond the existing documented subset. |
| Synchrony | Existing normalized rules retained; current dealer assortment and production persistence not recertified. |
| Palladian Shelf | Current dealer comparison and production verification of both price schedules and linked product persistence. |
| San Clemente Honeycomb | Current base, TDBU and pole/attachment price schedules; dealer-account applicability and production persistence. |
| San Clemente Faux Wood | Current base and optional side-bracket price schedules; dealer-account applicability and production persistence. |
| Shutters | Current 805 rates and surcharge schedule for all six programs; finish/frame/louver/tilt/panel/shape/track comparison. |

## Evidence and release state

- Wood cut-out release `7d61abdc`: deployed September 19; 4,271 tests passed, 28 skipped; typecheck and build passed. `805-one.vercel.app` redirects successfully to the verified canonical site.
- San Clemente increment: local real-CRM controls saved/reopened C4127T Room Darkening, Cordless TDBU, flush mount, 2-inch recess and one 36-inch pole; also White 6008 faux wood, flush side mount and 3½-inch recess. Separate source/program mapping, boundaries and blocked pricing tested for all 11 colors. Full suite: 4,300 tests passed, 28 skipped; typecheck/build passed. Publication pending.
- Initial implementation commit `da2501e9` was pushed and deployed to the 805 Vercel project; canonical production and `805-one.vercel.app` responded successfully.
- Production verification quote `805-0310` saved and reopened Louise F1709, 36 × 60, cordless, 7-inch fold and 6-inch fabric valance. It exposed the legacy draft route: selection persistence passed, but pricing remained incomplete at $0. This is not verified live pricing.
- Production native quote `805-0312` saved and reopened Louise F1709, 36 × 60, quantity one, cordless, 7-inch fold, 6-inch fabric valance, no Light Guard and no premium hem bar. The authoritative endpoint retains a blocked status because the product restriction review is incomplete. The equivalent backend fixture computes $761 retail but correctly withholds a sendable snapshot. This is persistence proof, not live pricing certification.
- Browser verification uses the real CRM DesignCard in a local fixture. Louise saved/reopened with the same stable identity; SmartDrape F1868 appears; ND108 is selectable and ND118 is disabled. This is local verification, not a saved production quote.
- Local CRM wood cut-out controls saved and reopened a left middle cut-out, width 1 inch, top 20 inches and bottom 30 inches from the headrail.
- Authoritative backend integration tests exercise panel allocation, quantity, removal, overload, Roman component prices and serialization/reopening.
- Norman authenticated account R00743 is available. Its displayed billing identity differs from 805, so account applicability is awaiting owner confirmation before any dealer-price policy change. One unsubmitted Woodlore Americas comparison is recorded privately; the current pricing binder still has blank base rates.
- Existing dealer policy is still the July 21 account fixture. Current factors, freight, oversize and processing-fee scope need account verification. The different-dealer pricing PDF remains quarantined.
- No family is newly labelled “verified live” by this ledger. Existing limited/blocked runtime statuses remain intact.

Row-level working results are generated into `outputs/norman-completion/`: `programs.csv`, `grid-rows.csv`, `fabrics-colors.csv`, `honeycomb-color-cell-routes.csv`, `options.csv`, and `summary.json`. `norman-completion-audit.test.ts` exports the current code catalog when `NORMAN_AUDIT_EXPORT` is set. The comparison script records PDF page matches for every grid row. Raw dealer files and private local evidence are not part of the published source changes.
