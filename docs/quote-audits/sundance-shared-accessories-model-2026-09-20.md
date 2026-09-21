# Sundance shared order remotes, chargers and hubs

## Implemented scope

The versioned `sundance_shared_accessories_v1` input identifies one physical device by a staff-entered name and connects it to an exact line, independent assembly component, coupled motor owner, or Walden twin front/rear motor. Reuse the name only for the same physical device; different devices require different names. The selected-order server rebuild derives `sundance_order_accessories_v1` from those saved connections, ignores supplied ownership/charge records, multiplies motor connections by line quantity, and assigns one source charge to a deterministic owner. Unselected alternatives retain no derived allocation. New component copies do not inherit shared device records.

The UI offers only the existing source-backed compatible remote, wall-control, charger and hub entries. Per-line accessory quantities remain available. A shared assignment conflicts with a nonzero separate quantity for that same target/accessory; this blocks the entire device group, avoiding an apparently valid subtotal that omits invalid connections. Changing control makes incompatible saved assignments explicit errors until corrected. Repeated target connections, malformed records, fractional shade quantities, conflicting identities and source-review entries are rejected. Family-specific device aliases are deliberately not inferred.

Customer output hides internal device identifiers and source charge metadata. Existing manual/account pricing holds remain in force. Source ownership records are not final customer charges and do not alter historical snapshots or selling policy.

## Source evidence and independent limits

| Exact guide | PDF page | Fact used |
| --- | --- | --- |
| Walden Premier 2026A updated 10.01.25 | 9 | Situo one-channel = one shade; five-channel = up to five; Telis16 = up to16. Wall switch one/five = one/five shades. |
| Walden Select 2026A updated 10.21.25 | 9 | Same explicitly printed Somfy shade capacities. |
| Portfolio Roman Product/Price Guide 2026 | 16 | Same Somfy capacity statements. |
| SheerView Pricing Aug2026 | 17 | Up to20 shades per channel; single-channel remote133 retail. The multi-channel remote's total channel count is not supplied here. |
| Walden Premier / Select | 23 / 21 | Situo5 source185 retail; compatible Somfy accessories. |
| Portfolio | 26 | Somfy accessories; five-channel wall price40 conflicts with one-channel380 and remains blocked pending confirmation. |
| SheerView | 27 | Compatible motorized remote, hub and USB charger schedule. |

All guides are retained in `outputs/catalog-audit-2026-09-17/current-sources` in the canonical repository. Catalog descriptor records retain source IDs and exact charge pages separately from capacity pages. Existing cellular, Zebra/Vision and four roller/flat-Roman motorization schedules supply their exact net accessory choices and review exceptions. No capacity is inferred from a remote's channel count outside the explicit guide statements above. No cross-family compatibility is inferred from the same motor brand, RF label or equal price.

Unknown device capacities remain null with explicit range/channel/commissioning review metadata; they do not become automatic pricing eligibility. The Pro Hub specification's approximate100-foot unobstructed range and recommendation of one hub per floor are installation-review facts, not invented hard connection capacities. Walden Premier's458 and Select's468 Pro Hub retail amounts remain separate exact source identities.

## Verification

566 focused Sundance/model/server tests passed, followed by TypeScript validation. New tests independently assert the185 retail shared remote price and published five-shade limit, the SheerView20-shade boundary and133 price, unknown-capacity review, mixed family rejection, duplicate accessory blocking across affected lines, two-component and twin-motor allocation, coupled motor-owner identity, incomplete editable UI records, customer output filtering, and selected/unselected server repricing plus JSON reopen. Account-held customer prices stay held.

Production input/save/reopen proof is pending deployment. Automated selected-order evidence is not represented as a live server trace.
