# Norman Motorization Guide audit — 2026-07-22

## Pinned source

- Source ID: `norman-motorization-guide-2026-05`
- File: `Motorization Guide.pdf`
- Revision: `May 2026; latest revision 2026-05-11`
- SHA-256: `57692a04ac4abe2e8774f8b248f4516141929124580edc2527e85f29d4feb290`

The motorization guide controls compatibility, dimensions, required controls,
and included components. The July Retail Price Guide continues to control the
dollar amount of each priced motorization component.

## Normalized, send-eligible when complete

- Honeycomb Norman Smart: rechargeable charging wand, AC plug-in, and direct
  low-voltage configurations; Bottom Up, TDBU, Day & Night, and Skylight limits
  from page 9; 36W/65W adapter derivation; woven-fabric limits; pages 4 and
  6–14 controls and accessories.
- Honeycomb Automate Home: Bottom Up and Top Down normal/woven limits from page
  61; external rechargeable pack or AC adapter; compatible controls from pages
  61–64.
- Honeycomb AutoWand: Bottom Up normal/woven limits from page 75; no remote or
  hub; one included charging kit per three AutoWands, minimum one per order,
  from page 76.
- Roman Norman Smart: rechargeable battery with AC charger, AC plug-in, and
  direct low voltage; Flat/Batten versus Soft Fold area limits and 36W/65W
  derivation from page 19; Day & Night/Common Valance motor positions and
  controls from pages 18–22.
- Roman Automate Home: ARC internal rechargeable and 12V DC dimensions from
  page 65; external battery and shared-panel evidence from pages 69–71.
- Roman AutoWand: Flat/Batten and Soft Fold areas from page 79; one included
  charging kit per three AutoWands, minimum one per order, from page 80.
- Order-level controller rule: at least one compatible controller per Norman
  Smart or Automate family, unless a compatible existing remote is evidenced
  by its prior work-order number (page 4). Norman Smart and Automate controls
  cannot be mixed.

Every supported line stores the exact canonical motor, priced power accessory,
controller, and hub identities. Price input must match that canonical bill of
materials exactly; omitting a required charging wand or substituting another
family fails closed.

## Deliberate remaining hard block

The guide documents shared capacity but the current line-item data model does
not identify which lines share one purchased panel. Therefore:

- Norman Smart DC distribution panels (up to 12 motors; pages 13 and 21), and
- Automate DC distribution panels (up to 18 motors; page 70)

remain blocked. Direct building low-voltage power and Roman Automate external
battery packs are supported when explicitly selected. The shared-panel branch
must not be enabled until a quote-level shared-accessory record can allocate one
panel, validate its capacity/current requirements, and charge it once.
