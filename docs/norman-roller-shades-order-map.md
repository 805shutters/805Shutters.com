# Norman Roller Shades saved-draft order map

Captured 2026-07-22 from the authenticated Norman dealer portal for account `RA00743`.
The audit reused the existing `CODX-RR-FIELDS` draft and stopped before adding an item or
checking out. This map is the source of truth for the first manufacturer-order adapter.
The adapter may prepare a saved portal draft, but it must never click Norman's final
checkout or order-submission control.

## Portal chronology

Order header:

1. Lead time.
2. PO number and PO date.
3. Side mark.
4. Ship-via method.
5. Dealer ship-to company, contact, address, and telephone.
6. Delivery classification and optional delivery services.

Each Roller Shade line is entered in this order:

1. Room and window type/matching relationship.
2. Width and length, each split into a whole number and an eighth-inch fraction.
3. Mount type and window-versus-door installation.
4. Shade type and any coupled, dual, common-valance, or T-post dimensions.
5. Front fabric Type -> Collection -> Color; then pattern direction and fabric-join acknowledgement.
6. Back-shade fabric when the shade type requires it.
7. LightGuard 360 configuration when selected.
8. Lift system, then the lift-specific controls and accessories.
9. Valance and its dependent finish, size, return, splice/keystone, and cassette fields.
10. Bracket covers, fabric roll, handle/tassel, and control location.
11. Raceway, bracket type, hardware type/color, and chain details when applicable.
12. Hem bar and optional light-guard material/color.
13. Quantity and special instructions.
14. Poles, hold downs, shims, and Palladian Shelf options.

The measure sheet does not need to render fields in this order. The Norman adapter must
emit an explicit ordered interaction plan and must not depend on JSON property order.

## Verified portal values

| CRM meaning | Norman control value |
|---|---|
| Inside Mount | `I` |
| Outside Mount | `O` |
| Single Shade | `1` |
| Coupled Shades | `2` |
| Dual Shades | `5` |
| Common Valance | `4` |
| LightGuard 360 with T-Post | `6` |
| PrecisionLift Cordless | `L` |
| Continuous Cord Loop | `N` |
| Motorized | `Y` |
| Plastic chain | `CT001` |
| Stainless Steel Chain | `CT002` |
| Cordloop with Stainless Steel Chain | `CT003` |
| Plain hem bar | `HB001` |
| External hem bar | `HB002` |
| Fabric-Wrapped hem bar | `HB005` |
| Brushed Ebony Finish hem bar | `HB004` |

The portal also exposes shade-type value `7`, but its label was not visible in the live
form. Treat it as unsupported until its meaning is verified.

Valance values:

| Norman label | Value |
|---|---|
| No Valance | empty |
| No Valance; Will Order Separately | `V000` |
| Square Fascia | `F001` |
| Plain Curved Fascia | `F002` |
| Curved Fascia with Fabric | `F009` |
| 3 1/2 inch Fabric Valance | `F010` |
| 4 1/2 inch Fabric Valance | `F011` |
| 6 inch Fabric Valance | `F014` |
| 8 inch Fabric Valance | `F017` |
| 4 1/2 inch Modern Wood Valance | `MOD` |
| Cassette | `F013` |

Motor values:

| Norman label | Value |
|---|---|
| Rechargeable Battery with Wireless Charging Wand | `MT018` |
| Rechargeable Battery with Wired Charging Wand | `MT019` |
| Rechargeable Battery with AC Adapter Charger | `MT025` |
| DC Low Voltage Hard Wire | `MT030` |
| AC Adapter Plug-In | `MT031` |
| AutoWand | `MT026` |
| Automate Home Li-Ion ARC Motor (Rechargeable) | `MT023` |
| Automate Home 12V Low Voltage DC Motor | `MT028` |

## Confirmed dependency behavior

- Fabric is a strict three-stage cascade. The live path `Solar Screens` ->
  `Breeze Screen 3%` produced exact color-code choices such as `F1787 Linen Flax`,
  `F1789 Linen Khaki`, and `F1849 Linen Warm Ivory`.
- Coupled and common-valance selections replace one overall opening with multiple ordered
  shade widths, lengths, gaps, and headrail counts.
- Continuous Cord Loop requires chain type, chain color where applicable, control side,
  and standard or custom chain length.
- Motorized requires a motor code and conditionally requires charging, power, remote,
  channel, wall-switch, hub, solar, DC, repeater, battery, or cable fields.
- Valance selection controls finish, component color, width, return depth, splice/keystone,
  and cassette-cover choices.
- Outside mount can expose magnetic hold downs and shims; magnetic hold downs require a
  color. Product-specific size and compatibility rules remain Norman-controlled and must
  be validated before writing a draft.

## CRM and measure-form gaps that block automation

The current Roller builder captures mount, shade type, fabric, lift, valance, hem bar,
light-guard yes/no, roll type, hardware, cord-loop release, and motor type. A safe adapter
also needs structured values for:

- Window type/matching, window-versus-door installation, and all coupled/dual/T-post dimensions.
- Fabric Type, Collection, exact Norman color code/name, direction, and join acknowledgement.
- Valance finish/color, return dimensions, width/splice details, and cassette choices.
- Lift-specific chain, control, motor power, remote/channel, switch, and accessory fields.
- Bracket, raceway, hold-down/color, light-guard, pole, shim, and Palladian Shelf choices.
- Structured ship-to state/ZIP/country, delivery method/options, PO policy, and side-mark policy.

Until these fields are captured and validated, the order task must return `needs_input`
without opening or changing a Norman portal draft. Unknown labels or values must block;
the adapter must never guess a Norman code.

## Automation boundary

For each submitted measure revision, build and persist a normalized Norman payload first,
then create an ordered browser interaction plan. A run is review-ready only when it records
the Norman draft/session identifier, the mapped payload and adapter version, validation
warnings, and visual proof of the final review screen. The browser worker must have no
callable action for Norman's final checkout/submission step, and creating a saved draft must
not change the CRM quote or job to `ordered`.
