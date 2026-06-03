# Creative production brief

Date: 2026-06-01

## Required exports

Create each winning concept in three aspect ratios:

- Feed vertical: 1080 x 1350, 4:5.
- Square fallback: 1080 x 1080, 1:1.
- Stories/Reels: 1080 x 1920, 9:16.

Keep important text, logo, phone number, and CTA away from the top and bottom
UI areas on 9:16 creative.

## Creative concepts

### Concept 1 - Room reveal

Shot list:

- Wide shot of finished room with shutters or shades.
- Close-up of material/louver/fabric.
- Small text overlay: `Custom window treatments`.
- End card: `Free consultation - 805-806-9344`.

Video length:

- 10-15 seconds.

### Concept 2 - Light and privacy

Shot list:

- Window open/light flooding room.
- Shutter or shade adjusted.
- Final comfortable/privacy shot.

Overlay copy:

```text
Control light. Add privacy. Finish the room.
```

### Concept 3 - Product comparison

Carousel cards:

1. Shutters.
2. Shades.
3. Blinds.
4. Commercial coverings.
5. Free consultation CTA.

### Concept 4 - Local trust

Visual:

- Installer/team or polished project photo.

Overlay copy:

```text
Family-owned Ventura County window treatment company
```

### Concept 5 - Commercial

Visual:

- Office/storefront/large-window roller shades.

Overlay copy:

```text
Commercial roller shades and window coverings
```

## Copy rules

- Use minimal text on image.
- Keep phone number readable.
- Prefer installed-product photos over stock-like decorative photos.
- Show bright, inspectable rooms.
- Avoid dark, blurred, or heavily filtered imagery.

## File naming

Use this structure:

```text
805_[concept]_[ratio]_[version].jpg
805_room-reveal_4x5_v01.jpg
805_room-reveal_9x16_v01.mp4
```

## Generated starter assets

Run:

```bash
node scripts/generate_meta_creatives.mjs
```

Starter assets are written to `public/ads/` and mapped in
`content/ads/generated-creative-map.csv`.
