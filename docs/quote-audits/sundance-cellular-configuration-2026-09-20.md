# Sundance cellular configuration rules

Source: `I-Cellular-Shades_2026-web.pdf`, SHA256 `10b773a7a85131ea0576cd667f0660526a8d1395e4364724768c977d9e7b6c96`, effective May1,2025, downloaded current dealer-linked guide. Exact fabric/index routing previously reconciled separately.

Implemented in shared UI/server validation:

| System | Width inches | Height inches | PDF page |
|---|---:|---:|---:|
| Cordless |12–96|10–96|12|
| Cordless TDBU |19–96|10–84|12|
| Cordless Day/Night |19–72|10–72|12|
| Cordloop |12–120|10–120|12|
| Skylight |16–60|10–60|12|
| Verticell |24–120|24–118|13|
| Somfy Cord Lift WireFree TL25 |18–96|12–96|15|
| Simphony Cell Shade WireFree |17–96|positive,up to96;minimum unspecified|17|
| Simphony Concerto TDBU |36–96|positive,up to96;minimum unspecified|17|

Day/Night primary choices are light-filtering; blackout bottom choices retain their own exact color/code/grid. Changing operating system clears the second fabric. Both source grids plus the500 retail TDBU surcharge are disclosed; paired-fabric compatibility still requires dealer confirmation. No single-grid shortcut or account factor was introduced.

Verticell excludes Linen Print, Sheer and7/16-inch Double Cell across every color. Incompatible primary identity is cleared when changing system. Left/Right/Center stacks, Off White rails, inside2¾-inch mounting depth or4-inch flush depth, outside2¼-inch flat vertical surface,6-inch minimum stack and factory¼-width/½-height inside deductions are recorded. Those deductions are not applied twice or silently applied to opening measurements. No separate Verticell price is asserted.

Skylight uses finished dimensions and White001 side rails with no factory deduction. Two-on-one remains a component-verification hold until individual shade dimensions and charges are represented. Simphony minimum height remains explicit unknown, and the global Sundance manual-price gate remains active.

Validation:440 Sundance/quote-rule checks passed including independently transcribed minimum/maximum/just-outside dimensions, all148 fabric exclusions/routing, reverse/stale/forged DayNight identities, mount depths, skylight basis, shared server validation, and visible controls. Whole-worktree TypeScript passed. Production save/reopen for these new controls remains pending deployment.

Remaining implementation work: specialty-shape dimensions/template records, full two-on-one components, exact cellular motor/power/control accessory quantities and separate net/retail option evidence, other family control/size/assembly rules, and order-wide shared-accessory reconciliation. External gates remain dealer factors, source/account charge authority and unresolved assortment identities; these do not block continuing source-backed implementation.

## Control and motor option evidence increment

Imported the12 cordless width-band charges and17 cordloop width-band charges from PDF7–11, plus500 retail TDBU/DayNight,116 net skylight,220 net SomfyTL25,150 net Simphony standard and450 net Concerto motors. The source accessories comprise22 exact schedule rows across PDF15–17. Quantities persist per line, require whole nonnegative values and are restricted to the relevant motor family; changing operating systems clears prior accessory allocations. No controls are charged automatically to a customer.

The source evidence panel presents **retail options subtotal** and **net options subtotal** separately, never summed into an assumed account or selling price. Example Somfy motor220+Situo5remote83+twochargers36each=375 net. Concerto450+TDBUremote90+charger25=565 net. DayNight500 retail excludes both fabric bases. Shared accessory quantities remain explicit line allocations requiring order-wide review.

Exact source exceptions remain: Smoove multi-channel row says5-channel while its image says4-channel, so its100 net row is preserved but flagged for exact-item confirmation. Simphony transformer requires an extension cord without a priced length/specification; its selection adds a verification block. Simphony wall-switch function/channel compatibility with TDBU is not asserted. These exceptions are visible and also checked on the shared server path.

Validation after this increment:453 Sundance/quote-rule checks passed and whole-worktree TypeScript passed. Checks include first/last and between-band control prices, all22 independently transcribed accessory amounts, negative/fractional/nonfinite quantities, stale and incompatible controls, separate net/retail bases, and source-ambiguity holds. Live persistence of the new cellular accessory fields awaits deployment.

## Specialty shape capture

Added Standard Arch, Quarter Arch, Circle, Hexagon and Octagon under a separate Specialty Shape operating-system destination. The existing fabric IDs remain intact, and server validation checks geometry/dimensions, required template references, all six/eight polygon side measurements and single-assembly state. Changing back to a rectangular system clears stale shape/template details.

PDF14 was rendered and visually inspected because plain text interleaves the adjacent shape columns: **Quarter Arch maximum width50 inches; Circle maximum width42 inches**. Standard Arch18–84 wide and9–48 high; perfect width=2×height. Quarter Arch9–50 wide; height geometry still requires manufacturer review. Circle9/16 pleat9–42 wide and7/16 pleat12–42 wide; other cells remain explicit confirmation exceptions. Perfect circles require equal width/height. Hexagon/Octagon21–48 wide and12–48 high; all sides and actual template required. A template reference is saved evidence metadata and does not assert that the actual file has been attached or approved.

Source specialty surcharge116 net and non-perfect arch template trim100 net are shown separately from unverified fabric-base pricing. The trim charge is not assigned speculatively to non-perfect circles.456 focused Sundance/quote-rule checks and TypeScript passed. New production proof pending release.

## Cut-outs and extension poles

PDF7–11 source rows now have saved quantities: cut-outs25 net each,3–5-foot extension pole64 net and5–9-foot pole76 net. Cut-out detail/template-reference text is preserved, while positive cut-out quantity explicitly requires geometry/template verification. This is source charge capture, not geometric approval. All quantities require nonnegative whole values. Pole reach and operating compatibility remain visibly subject to confirmation.457 focused checks and TypeScript passed.
