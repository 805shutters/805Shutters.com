# 805 Shutters Homepage AI Photo Prompt Set

Goal: create selectable AI-generated homepage scroll photos without replacing the current main roller/drapery photo.

> Nav hover previews: the home-page product dropdowns (src/lib/product-preview-data.ts)
> show one photo per product type. Two slots still need brand photos — generate with
> the prompts in section 9 and save to public/images/product-previews/:
> - goblet-pleat-drapery.jpg (currently no preview shows for that item)
> - a room-darkening honeycomb office shot (commercial mode currently reuses the
>   conference blackout photo)
> Licensed Unsplash fill-ins cover Vertical Blinds, Aluminum Blinds, Grommet, Rod
> Pocket, Inverted Box Pleat, and five commercial slots (see
> public/images/product-previews/manifest.json). Replace any of them with brand
> photos whenever real installs are available.

Style for every image:
- Full-width luxury editorial photography, similar to the current RH-inspired direction.
- Ventura/coastal California light, warm neutral architecture, refined furniture, polished but natural.
- Product must be clearly visible and accurate.
- No text, logos, people, animals, watermarks, posters, or graphic layouts.
- Leave clean center space for HTML overlay text.
- Wide horizontal hero composition, 16:9 or wider.

## Final Homepage Photo Flow Assets

Final stacked photo-flow assets live in `public/images/homepage-flow/` and are
used in this exact residential homepage order. The original home photo remains
the top hero image; the remaining treatments stack below it with no timed photo
rotation.

| Order | Slide | File |
| --- | --- | --- |
| 1 | Original home photo | `main-homepage-photo.png` |
| 2 | Shutters | `shutters.png` |
| 3 | Blackout Honeycombs | `blackout-honeycombs.png` |
| 4 | Drapery | `drapery.jpg` |
| 5 | Roller Shades | `roller-shades.jpg` |
| 6 | Roman Shades | `roman-shades.jpg` |
| 7 | Bamboo Shades | `bamboo-shades.jpg` |
| 8 | Faux Wood Blinds | `faux-wood-blinds.png` |
| 9 | Exterior Patio Shades | `exterior-patio-shades.jpg` |
| 10 | Vertical Blinds | `vertical-blinds.png` |
| 11 | Mini Blinds | `mini-blinds.png` |
| 12 | Layered Shades | `layered-shades.jpg` |
| 13 | Sheer Shades | `sheer-shades.png` |
| 14 | Natural Shades | `natural-shades.jpg` |
| 15 | Panel Track Shades | `panel-track-shades.png` |
| 16 | Vertical Cellular Shades | `vertical-cellular-shades.png` |
| 17 | Skylight Shades | `skylight-shades.png` |
| 18 | Skylight Shutters | `skylight-shutters.png` |

Existing AI source notes:
- Shutters uses `public/assets/ai-concepts/homepage-feed/raw-review/raw-ai-option-12.png`.
- Roman Shades uses `public/assets/ai-concepts/homepage-feed/raw-review/raw-ai-option-20-roman-shades-white-living-room.jpg`.
- Drapery uses `public/images/805-portfolio-drapery-living-room.jpg`.

New June 13, 2026 generated prompts:

Vertical Blinds:
Ultra realistic luxury editorial interior photography of a bright Ventura/coastal California living room with a wide sliding glass patio door and refined garden view. Muted sage-green vertical blinds with fabric vanes, partially open so the vertical product structure is unmistakable. Wide horizontal 16:9 hero composition with clean center overlay space. Warm natural California daylight, warm neutrals, cream plaster, pale oak, soft linen. No text, logos, people, animals, watermarks, posters, or graphic layouts. Product must read as vertical blinds, not drapery or shutters.

Mini Blinds:
Ultra realistic luxury editorial interior photography of a refined Ventura/coastal California home office with tall windows and a distant garden or hillside view. Slim soft blue-gray aluminum mini blinds with narrow horizontal slats, tilted to filter sunlight; the narrow mini-blind scale must be clear. Wide horizontal 16:9 hero composition with clean center overlay space. Bright warm morning light with crisp slat shadows, warm neutrals, oak desk, cream plaster. No text, logos, people, animals, watermarks, posters, or graphic layouts. Product must read as mini blinds, not faux wood blinds or shutters.

Sheer Shades:
Ultra realistic luxury editorial interior photography of an airy Ventura/coastal California living room with large windows and a soft garden view. Sheer shades with subtle champagne-blush translucent fabric and soft horizontal vanes suspended between sheer layers, clearly visible and filtering daylight. Wide horizontal 16:9 hero composition with clean center overlay space. Glowing daylight, soft diffusion, warm whites, pale oak, linen, soft greenery. No text, logos, people, animals, watermarks, posters, or graphic layouts. Product must read as sheer shades, not roller shades or drapery.

Panel Track Shades:
Ultra realistic luxury editorial interior photography of a modern Ventura/coastal California living room with a broad sliding glass door opening to a patio and hillside garden. Wide sliding panel track shades with large vertical fabric panels on an overhead track, partially stacked to one side and partially covering the glass. Wide horizontal 16:9 hero composition with clean center overlay space. Warm coastal daylight, warm neutrals, cream fabric panels, pale oak, soft stone. No text, logos, people, animals, watermarks, posters, or graphic layouts. Product must read as panel track shades, not vertical blinds or drapery.

Vertical Cellular Shades:
Ultra realistic luxury editorial interior photography of a refined Ventura/coastal California bedroom or sitting room with a tall sliding glass door and soft garden light. Vertical cellular shades for a sliding door, with clear pleated honeycomb fabric running vertically in tall panels, partially open to show the patio view. Wide horizontal 16:9 hero composition with clean center overlay space. Warm filtered daylight, cream cellular fabric, warm plaster, pale oak, soft greenery. No text, logos, people, animals, watermarks, posters, or graphic layouts. Product must read as vertical cellular shades, not vertical blinds, drapery, or shutters.

Skylight Shades:
Ultra realistic luxury editorial interior photography of a bright coastal California kitchen or loft with angled ceiling skylights and warm plaster architecture. Skylight shades installed inside angled skylight openings, with light-filtering cellular or pleated fabric panels fitted cleanly to the skylight frames. Wide horizontal 16:9 hero composition that includes ceiling skylights and clean overlay space. Sunlit but softly controlled warm daylight, warm whites, cream fabric, pale oak, soft stone. No text, logos, people, animals, watermarks, posters, or graphic layouts. Product must read as skylight shades, not regular window shades.

Skylight Shutters:
Ultra realistic luxury editorial interior photography of a refined coastal California living room or kitchen with angled ceiling skylights, warm plaster, pale oak beams, and clean architectural detail. Custom skylight shutters fitted inside angled skylight openings, with small operable louvers visible within each skylight frame. Wide horizontal 16:9 hero composition with clean overlay space. Bright controlled daylight, warm neutrals, white shutter louvers, pale oak, cream plaster. No text, logos, people, animals, watermarks, posters, or graphic layouts. Product must read as skylight shutters, not standard wall shutters or skylight shades.

## 1. Shutters

Option A:
Ultra realistic architectural photography, wide horizontal hero image. A bright coastal California living room with large custom white plantation shutters across tall windows, clean trim, warm daylight, natural oak flooring, neutral linen furniture, and a green garden visible through slightly open louvers. Luxury editorial interior design photograph. No text, logos, people, animals, or watermark.

Option B:
Ultra realistic luxury bedroom suite with crisp white plantation shutters on multiple windows, soft morning light, cream walls, tailored bedding, warm wood accents, and a calm Ventura coastal view beyond the louvers. The shutters are the clear focus. Wide horizontal editorial photo. No text, logos, people, animals, or watermark.

## 2. Exterior Shades

Option A:
Ultra realistic luxury coastal patio and indoor-outdoor living room, wide horizontal hero image. Large exterior roller shades filter bright ocean glare across a covered patio opening, with cream stucco, natural wood beams, linen side drapery, palm trees, and blue ocean beyond. Bright warm daylight, refined outdoor furniture. No text, logos, people, animals, or watermark.

Option B:
Ultra realistic Ventura hillside terrace with motorized exterior solar shades partially lowered across a wide patio, golden sunset light, mountain and ocean view, natural wood ceiling, stone floor, cream outdoor sofas, and potted olive trees. Wide editorial architecture photograph. No text, logos, people, animals, or watermark.

## 3. Roman Shades

Option A:
Ultra realistic bright kitchen breakfast nook with tailored soft Roman shades in warm linen fabric on wide windows, sunlit garden outside, arched plaster walls, natural oak table, cream cushions, and fresh greenery. Luxury coastal California interior photography, wide hero composition. No text, logos, people, animals, or watermark.

Option B:
Ultra realistic primary bedroom with relaxed linen Roman shades layered with soft side panels, warm neutral bedding, plaster walls, natural wood nightstands, and filtered morning light. Elegant custom window treatment photography. Wide horizontal image. No text, logos, people, animals, or watermark.

## 4. Silhouette / Sheer Shades

Option A:
Ultra realistic bright living room with sheer silhouette shades across large windows, soft horizontal vanes floating between sheer fabric, glowing garden light, pale oak floors, cream sofa, and refined coastal decor. Product texture is clear and accurate. Wide horizontal hero photo. No text, logos, people, animals, or watermark.

Option B:
Ultra realistic dining room with large sheer silhouette shades filtering afternoon sun, soft translucent fabric, visible horizontal vanes, warm white walls, sculptural wood dining table, olive tree outside, and bright airy luxury styling. Wide editorial photograph. No text, logos, people, animals, or watermark.

## 5. Layered Shades

Option A:
Ultra realistic luxury living room with layered window treatments: woven roller shades under soft linen drapery panels, warm coastal daylight, cream upholstery, natural wood coffee table, and garden view. The combination of shades and drapery is the focus. Wide horizontal hero image. No text, logos, people, animals, or watermark.

Option B:
Ultra realistic bedroom with dual layered shades, translucent light-filtering shade in front of a room-darkening shade, plus soft side drapery, warm neutral walls, tailored bed, and subtle evening light. Premium custom window treatment photography. Wide horizontal composition. No text, logos, people, animals, or watermark.

## 6. Honeycomb Shades Blackout

Option A:
Ultra realistic moody luxury bedroom with dark blackout honeycomb shades fully lowered across wall-to-wall windows, crisp cellular pleated texture, warm bedside lamp, wood panel wall, cream bedding, and a small controlled reveal of daylight near the bottom edge. Wide editorial photo. No text, logos, people, animals, or watermark.

Option B:
Ultra realistic high-end media room or bedroom with blackout honeycomb cellular shades in charcoal fabric, nearly dark interior, warm amber lamp glow, refined wood details, plush neutral bedding or seating, and a tiny sliver of garden light below the shades. Wide horizontal photography. No text, logos, people, animals, or watermark.

## 7. Wood Blinds / Faux Wood Blinds

Option A:
Ultra realistic coastal home office with warm white faux wood blinds on tall windows, slats angled to filter sunlight, natural oak desk, cream plaster walls, woven rug, greenery outside, and bright refined styling. Wide horizontal hero image. No text, logos, people, animals, or watermark.

Option B:
Ultra realistic kitchen and dining area with natural wood blinds across large windows, warm sunlight through angled slats, cream cabinetry, stone counters, oak dining table, and clean Ventura coastal design. Wide editorial architecture photograph. No text, logos, people, animals, or watermark.

## 8. Vertical Blinds

Option A:
Ultra realistic modern coastal living room with elegant vertical blinds on a wide sliding glass door, soft cream fabric vanes, filtered afternoon light, ocean-side patio beyond, neutral sectional, natural wood accents, and polished interior design styling. Wide horizontal hero photo. No text, logos, people, animals, or watermark.

Option B:
Ultra realistic bright bedroom with refined vertical blinds across a large patio slider, vanes partially open to reveal garden light, warm neutral bedding, plaster walls, oak floors, and soft coastal California atmosphere. Wide editorial window treatment photograph. No text, logos, people, animals, or watermark.

## 9. Drapery Heading Styles (nav hover previews)

Goblet Pleat:
Ultra realistic close-up of custom goblet pleat drapery panels in warm cream linen, the rounded goblet-shaped pleats clearly visible along the top heading below a dark bronze rod, soft coastal morning light raking across the fabric folds, warm plaster wall behind. Luxury custom workroom photography, wide horizontal composition. No text, logos, people, animals, or watermark.

## 10. Commercial Mode (Southern California only)

Style rule for EVERY commercial photo: the setting must read as Southern
California — bright clear light, palms, drought-tolerant landscaping, dry
golden hills, stucco, smooth plaster, or concrete tilt-up architecture.
Never show dense green deciduous canopies, autumn foliage, conifer forests,
or wet/overcast East Coast weather. Mix real-world applications: small
offices and storefronts alongside larger offices and industrial warehouses.

Office Roller Shades (SoCal):
Ultra realistic Southern California low-rise office interior with light-filtering roller shades on a wall of windows, palm trees and a sun-washed stucco business park visible outside, bright clear daylight, polished concrete floor, simple modern desks. Wide editorial architecture photograph. No text, logos, people, animals, or watermark.

Motorized Lobby Shades (SoCal):
Ultra realistic Southern California office lobby with tall glass and motorized solar shades partially lowered, palm trees and dry golden hills beyond the parking area, warm afternoon light, stone floor, modern seating. Wide horizontal photo. No text, logos, people, animals, or watermark.

School / Facility Shades (SoCal):
Ultra realistic Southern California school classroom with cordless roller shades on wide windows, a stucco campus courtyard with palms and drought-tolerant planting outside, bright clear daylight, simple desks and chairs. Wide editorial photograph. No text, logos, people, animals, or watermark.

Warehouse / Tenant Improvement Shades (SoCal):
Ultra realistic Southern California industrial warehouse office build-out, roller shades on the glass office partition and high windows, exposed steel structure, concrete tilt-up walls, forklifts absent, bright daylight through skylights. Wide editorial photograph. No text, logos, people, animals, or watermark.

Room-Darkening Honeycomb (commercial, SoCal):
Ultra realistic modern Southern California office meeting room with room-darkening honeycomb cellular shades fully lowered over wide windows, crisp pleated cellular texture in a warm gray fabric, dim comfortable presentation lighting, clean conference table and chairs. Wide editorial architecture photograph. No text, logos, people, animals, or watermark.
