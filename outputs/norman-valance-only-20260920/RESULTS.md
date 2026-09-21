# Norman standalone valances — implementation handoff

Two source-documented offerings now have dedicated CRM destinations:

| Product ID | Source | Original finish identities | Program |
|---|---|---:|---|
| `norman_ultimate_faux_valance_only` | Ultimate Faux Wood Guide September 2026 pp10–11 | 16 from `faux_wood` | `norman_ultimate_faux_valance_only_source` |
| `norman_smartprivacy_valance_only` | SmartPrivacy Guide October 2024 pp10–11 | 6 from `smartprivacy_faux` | `norman_smartprivacy_valance_only_source` |

Norman totals become **23 destinations / 58 programs**. Existing blind IDs, programs, pricing policy and historical snapshots are unchanged. Finish choices store the original source color ID inside `norman_valance_only_v1`; no duplicate finish identity or invented grid is introduced. The current detail-field export will still need its dynamic-control supplement: this uses a dedicated typed form, like the existing ancillary destinations.

The Valances product type opens a dedicated form for source finish/style, explicit inner length, return sides/length, and Ultimate-only optional keystone count/layout/centers. Quantity counts complete valances. Window dimensions are not used. The form retains rapid edits locally and saves one complete record; stale server acknowledgements preserve later edits.

Both programs are `manual_required` / `customerRetailStatus: unverified`, with empty price grids. The server always returns `norman.valance_only.price_approval` until a separately authorized price policy exists. A supplied manual override and forged derived record cannot authorize customer pricing. Actual standalone availability, price, freight and selling treatment remain unverified. Dealer cost, suggested retail and selling policy were not changed.

Documented rules:

- Inner length must be positive and no greater than 384 inches; the guide does not establish a smaller minimum or an ordering increment, so none is invented.
- A valance over 96 inches is split into sections no longer than 96 inches. Connector splits are equal. SmartPrivacy cannot select custom splits or keystones.
- Ultimate supports one to three keystones, equal or specified placement, minimum 13-inch inner length, at least 6½ inches from each inner end and 18 inches between centers. Keystone centers are measured from the left of the inner width. A keystone on an unspliced valance does not fabricate a split.
- Return lengths are explicitly recorded within ½–5 inches. Ultimate permits left/right/both/no returns; SmartPrivacy permits both/no returns. No returns clears the length.
- Every family/style/finish and program identity is validated on the server. Natural-unit dimension exceptions apply only to the two exact IDs with a matching typed source-product record.

Validation completed: **6,164 tests passed / 28 skipped**, typecheck passed. Focused tests cover all 22 finish routes,96/96.125/192/384 boundaries,384.001 rejection, return limits,13-inch keystone minimum, custom spacing and split limits, incompatible SmartPrivacy choices, malformed/cross-family records, stale atomic draft acknowledgements, actual backend serialization/reopen equivalence, human-readable customer projection, and pricing-override/derived-record rejection. The general grid-integrity test now permits a wholly empty width-only grid only when its effective price basis is `manual_required`; priced width grids still require their one-row schedule.

Production build passed. Commit SHA is supplied in the agent handoff. No production save/reopen claim yet.

## Production proof after integration

Create an internal verification draft without contact details. Select **Valances → Norman**, then each destination:

1. Ultimate: current finish,3-inch Linear,192-inch inner length, both1-inch returns, two custom keystones at60 and132 inches. Save once. Confirm pieces60/72/60 and one complete typed record after full reload/reopen; quantity2 is two valances. Change one center to157: a section exceeds96 and must be blocked; restore132.
2. SmartPrivacy: current finish,3¼-inch Designer Crown,384-inch inner length, no returns. Save/reopen and confirm four96-inch pieces. UI must offer no keystone or custom-split option.384.001 must show the exact maximum-length issue; restore384.
3. Both lines must retain the standalone price/availability/freight hold, produce no authoritative price snapshot and keep Contract/customer delivery blocked. Inspect readable valance details; no raw `V1`, source identity object or internal pricing metadata should appear.

The 22-row `finish-routes.csv` and 10-row `controls.csv` account for every new current finish route and editable field. The source excerpt packet records the inspected pages and extraction hashes. This change closes the two **missing catalog destination** gaps found by the dynamic inventory; it does not close their price evidence gaps.
