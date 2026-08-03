# Shutter frame pricing-addition matrix

Audit date: 2026-07-27
Scope: Norman shutters and Onyx shutters
Status: Norman current-source verified; Onyx mapped from the user-supplied
2020-2021 Reference Guide

## What “overlap” means in Quote V4

The manufacturer pricing sheets do not use one universal frame overlap. Each
frame owns a **physical overlap/reveal** and a **pricing addition per framed
side**. Those numbers are not always identical. When the user enters window
size, Quote V4 must use the manufacturer's pricing addition to obtain the
pricing frame size before calculating square footage.

This is separate from an inside-mount fitting deduction:

- **Pricing addition** expands the opening/window size to the frame-to-frame size
  used to calculate price.
- **Physical overlap/reveal** is the portion of the frame profile extending
  beyond the opening. Norman rounds several Z-frame reveals upward for pricing.
- **Fitting deduction** reduces the ordered frame-to-frame size so the shutter
  fits the opening.
- **Max Frame-to-Frame input** is already the finished pricing size, so no frame
  pricing addition is applied again.

For a four-sided frame with addition `A`:

`pricing width = window width + (2 × A)`
`pricing height = window height + (2 × A)`

For the normal three-sided left/right/top arrangement:

`pricing width = window width + (2 × A)`
`pricing height = window height + A`

Quote V4 must model the actual framed sides, because a sill plate, omitted bottom
frame, or one-sided frame changes the height calculation.

## Norman — current verified overlaps and pricing additions

The supplied `e. Frame Style.pdf` is the May 2026 Woodlore frame guide. The
pricing additions below were cross-checked against the current Woodlore,
Woodlore Plus, Brightwood, and Normandy pricing documents wherever the frame is
offered.

| Norman frame | Mount | Exact physical reveal per side | Pricing addition per side | 4-sided pricing addition (W, H) | Notes |
|---|---|---:|---:|---:|---|
| 2-inch Camber Deco | Outside | 2 in default | 2 in | +4, +4 | Optional flush installation uses 2.625-inch frame-back width |
| 2-inch Classic Deco | Outside | 2 in default | 2 in | +4, +4 | Optional flush uses 2.625 inches; not AquaShield |
| 3-inch Ridge Deco | Outside | 3 in default | 3 in | +6, +6 | Optional flush uses 3.625 inches; not AquaShield |
| 2.5-inch Mission Deco | Outside | 2.5 in default | 2.5 in | +5, +5 | Optional flush uses 3.125 inches; no standard Deco sill plate; not AquaShield |
| 3-inch Crown Z | Inside | **2.125 in** | **2.25 in** | **+4.5, +4.5** | Pricing factor is 1/8 inch larger per side than exact profile reveal |
| 2-inch Bel Air Z | Inside | 1.125 in | 1.25 in | +2.5, +2.5 | Pricing factor is 1/8 inch larger per side |
| 2-inch Bullnose Z | Inside | 1.125 in | 1.25 in | +2.5, +2.5 | Pricing factor is 1/8 inch larger per side; not AquaShield |
| 1.5-inch Bullnose Z | Inside | 0.875 in | 1 in | +2, +2 | Pricing factor is 1/8 inch larger per side |
| 1.25-inch Beaded Z | Inside | 0.875 in | 1 in | +2, +2 | Pricing factor is 1/8 inch larger per side; not AquaShield |
| Bullnose Tilt Out Z | Inside | 0.875 in | 1 in | +2, +2 | Pricing factor is 1/8 inch larger per side; no sill plate; not AquaShield |
| 1.5-inch Deep Bullnose Z | Inside | 0.875 in | 1 in | +2, +2 | AquaShield-only; pricing factor is 1/8 inch larger per side |
| Vintage Hang Strip | Inside | No outside overlap | 0 | +0, +0 | Price by entered Max Frame-to-Frame |
| Vintage Hang Strip | Outside | 1.5 in pricing allowance | 1.5 in | +3, +3 | Physical strip is 0.875 inch wide; placement controls actual reveal |
| Traditional Hang Strip | Inside | No outside overlap | 0 | +0, +0 | AquaShield only; price by Max Frame-to-Frame |
| Traditional Hang Strip | Outside | 1.5 in pricing allowance | 1.5 in | +3, +3 | AquaShield only |
| Beaded L family | Outside | 1.5 in | 1.5 in | +3, +3 | Includes offered light-block/buildout variants |
| Vintage L family | Outside | 1.5 in | 1.5 in | +3, +3 | Includes offered light-block/buildout variants |
| Plain L | Outside | 1.5 in | 1.5 in | +3, +3 |  |
| Deep Plain L | Outside | 1.5 in | 1.5 in | +3, +3 | AquaShield only |
| Beaded/Vintage/Plain/Deep Plain L | Inside | Opening fit | 0 | +0, +0 | Price by Max Frame-to-Frame; use separate fitting deduction |
| Colonial L family | Outside | 1.125 in | 1.125 in | +2.25, +2.25 | Woodlore, Woodlore Plus, Normandy; absent from Brightwood price table |
| Colonial L family | Inside | Opening fit | 0 | +0, +0 | Price by Max Frame-to-Frame |
| Track shutter | Inside / semi-inside | — | 0 | +0, +0 | Price by entered width and height |
| Track shutter | Outside | — | 1.5 in | +3, +3 | Separate track-product rule |

Three-sided left/right/top pricing uses twice the per-side pricing addition in
width and once in height. Two-sided left/right uses twice the value in width and
zero in height. One-sided configurations use the same per-side value: add it to
width for one vertical side or to height for one horizontal side. A three-sided
configuration with a sill plate includes both the top-frame addition and the
sill-plate addition in height, so its height addition equals the four-sided
height addition.

For the optional flush Deco installation, the supplied frame guide expressly
says MFF equals window size plus the larger **frame-back width**, not the nominal
face width. Quote V4 must therefore price the resulting actual MFF size rather
than silently reusing the smaller standard window-size factor.

### Norman frame-family variants

The addition belongs to the frame profile, not to a generic shutter fallback:

- Beaded L: 1/4-inch light block, standard, 1/2-inch buildout, and 1-inch
  buildout where offered.
- Vintage L: 1/4-inch light block, standard, 1/2-inch buildout, and 1-inch
  buildout where offered.
- Colonial L: 1/4-inch light block, standard 1/4-inch WLB, and 1/2-inch buildout.
- Plain L and AquaShield-only Deep Plain L.
- The current Woodlore Plus book adds AquaShield-only 1.5-inch Deep Bullnose Z
  and Traditional Hang Strip.

Product availability still belongs inside each independent
`manufacturer + product` model. An unavailable frame must not appear merely
because another Norman shutter product offers it.

### Norman physical fitting rules kept separate from pricing

The current measuring guide gives these fitting deductions:

- Inside-mount L frame: suggested deduction of 1/16 inch on each side.
- Inside-mount Z frame: standard deduction of 1/16 inch on each side.
- Inside-mount hang strip: deduction of 1/8 inch on each side.
- Outside-mount hang strip beside the panel: 1/2 inch on each side.

These are installation/order deductions and must not replace or be combined
with the pricing additions above.

### Norman 3-inch Crown Z example

The supplied frame drawing shows the exact Crown Z reveal as **2.125 inches per
side**. Norman's current pricing document deliberately uses a rounded **2.25-inch
pricing addition per side**.

For a 30-inch-wide opening with left and right Crown Z:

`30 + 2.25 + 2.25 = 34.5 inches pricing width`

## Onyx — supplied-guide overlap matrix

The user-supplied `OnyxProgramBinder2020.pdf` is the Onyx 2020-2021 Reference
Guide. Page 4 supplies every frame profile and page 13 supplies the named pricing
groups. The frame drawings resolve the profiles not individually repeated in
the pricing table.

| Onyx frame | Mount | Overlap / pricing addition per side | 4-sided pricing addition (W, H) | 3-sided L/R/top | Guide basis |
|---|---|---:|---:|---:|---|
| L Frame | Outside | 1.75 in | +3.5, +3.5 | +3.5, +1.75 | L Frame Series price row and 1.75-inch profile |
| L Frame Bullnose | Outside | 1.75 in | +3.5, +3.5 | +3.5, +1.75 | L Frame Series; profile is 1.75 inches |
| Vinyl L Frame | Outside | 1.75 in pricing factor | +3.5, +3.5 | +3.5, +1.75 | L Frame Series pricing group |
| L Frame / L Bullnose / Vinyl L | Inside | 0 | +0, +0 | +0, +0 | No factory deduction; order Max Frame-to-Frame |
| Decor Frame 2 | Outside | 2.75 in | +5.5, +5.5 | +5.5, +2.75 | Explicit pricing row; full frame-back width is 2.75 inches |
| Decor Frame 3 | Outside | 3.75 in | +7.5, +7.5 | +7.5, +3.75 | Explicit pricing row; full frame-back width is 3.75 inches |
| Z Frame Trim | Inside | **0.375 in** | **+0.75, +0.75** | **+0.75, +0.375** | Explicit pricing row and profile drawing |
| Z Frame Fine | Inside | **1 in** | **+2, +2** | **+2, +1** | Explicit pricing row and profile drawing |
| Z Frame Crown | Inside | 2.125 in | +4.25, +4.25 | +4.25, +2.125 | Explicit pricing row and profile drawing |
| Z Frame Crest | Inside | 2.125 in | +4.25, +4.25 | +4.25, +2.125 | Profile drawing gives the 2.125-inch overlap |
| Vinyl Z Frame Small | Inside | 2 in | +4, +4 | +4, +2 | Profile drawing gives the 2-inch overlap |
| Vinyl Z Frame Large | Inside | 2.5 in | +5, +5 | +5, +2.5 | Profile drawing gives the 2.5-inch overlap |

The Onyx catalog also lists T-Post, but it is an internal divider rather than a
perimeter frame and therefore is not treated as a window-size overlap.

The Onyx measuring page separately states:

- all inside-mount Z frames receive a total factory deduction of 3/8 inch in
  width and 3/8 inch in height;
- inside-mount L frame receives no factory deduction and must be ordered by Max
  Frame-to-Frame;
- bullnose/radius openings require 2 inches added to width and height because
  the curved surface is not mountable.

Those are measurement rules, not substitutes for the pricing additions.

### Onyx Crown example

Under the supplied Onyx table, a 30-inch opening with left and right Z Frame Crown
would price at:

`30 + 2.125 + 2.125 = 34.25 inches`

This is different from Norman's current 34.5-inch result and confirms why frame
rules cannot be shared between manufacturers.

## Required Quote V4 calculation order

1. Select exact manufacturer and shutter product.
2. Select mount type and frame from only that product's allowed frames.
3. Record which perimeter sides are framed and whether a sill plate is used.
4. If dimensions are window/opening size, apply that frame's per-side pricing
   additions to obtain pricing width and height.
5. If dimensions are already Max Frame-to-Frame, do not add overlap again.
6. Calculate `(pricing width × pricing height) / 144`.
7. Round up to the next whole square foot and apply the product's square-foot
   minimum.
8. Look up that exact square-foot row in the independent
   `manufacturer + product` grid.
9. Apply only that product's verified options and surcharges.

## Source-handling rule

Every frame now has an overlap treatment. Values printed in a pricing table are
stored as explicit pricing factors. Values supplied by a profile drawing are
stored with page-level provenance as profile-derived factors. Quote V4 must not
substitute nominal frame names such as “2-inch” or “3-inch” for the actual
manufacturer factor.

## Sources

Current Norman:

- `vendor-sources/norman/documents/m. Pricing--3c7eefdef7.pdf` — Woodlore
- `vendor-sources/norman/documents/m. Pricing--a964e1dce7.pdf` — Woodlore Plus
- `vendor-sources/norman/documents/m. Pricing--073757e9b3.pdf` — Brightwood
- `vendor-sources/norman/documents/m. Pricing--8805eefb02.pdf` — Normandy
- `vendor-sources/norman/documents/e. Frame Style--9b0f890066.pdf` — Woodlore
- `vendor-sources/norman/documents/e. Frame Style--1133084ead.pdf` — Woodlore Plus
- `vendor-sources/norman/documents/e. Frame Style--7d146a6433.pdf` — Brightwood
- `vendor-sources/norman/documents/e. Frame Style--0181e79d61.pdf` — Normandy
- `vendor-sources/norman/documents/MeasuringGuidelines--7d5a7818d4.pdf`

User-supplied Onyx guide:

- `/Users/michaelshepard/Downloads/OnyxProgramBinder2020.pdf`, PDF page 4
  (frame profiles), PDF page 9 (measurement additions/deductions), PDF page 13
  (pricing additions).

User-supplied Norman guide:

- `/Users/michaelshepard/Downloads/e. Frame Style.pdf`, May 2026, PDF pages 1-4.
