# Shutter callout attachments

Descriptions must connect from their card edge to the component they describe.
The approved pencil raster includes white margins; image/container percentages
cannot be used as a substitute for a component location.

## Implementation contract

- `shutter-anatomy-targets.ts` owns reviewed regions in the original 627 by 627
  image coordinate system. `ShutterReferenceArtwork` renders those regions in
  the same scaled box as the original image.
- Grouped shutter cards contain descriptions of one component. Hinge color is
  separate from material/color; louver size targets a blade; hidden tilt targets
  a stile; frame/mount targets the outer frame; panel configuration respects a
  single L or R selection regardless of the card's placement.
- Front tilt rods and divider rails absent from the original drawing use labeled
  supplemental detail drawings. A missing region suppresses its leader and sets
  `data-attachment-errors`; it never guesses an endpoint in empty space.
- ResizeObserver, image-load events, font readiness, selection/dimension changes,
  and print transitions recompute measured paths. Phone leaders route outside
  the description cards and remain visible.

## Regression gate

Run `npm test`, `npm run typecheck`, `npm run test:anatomy`, and `npm run build`.
CI installs Chromium and runs the attachment suite on every main push and PR.
The synthetic `/quote/anatomy-preview/attachments/` fixture is development-only;
it uses the real shared quote card and has no customer/provider writes.

The browser gate checks that every leader's rendered endpoint is inside its
named component region, its start touches the description edge, and its path
does not cross another description. Cases cover the reported configuration,
single-right panel, hidden/front tilt, divider detail, long descriptions,
320–1440px viewports, 620px breakpoint, dimension/option changes, delayed image
loading, missing targets, print, and a roller-control regression.

When replacing artwork, review the target regions visually and update the asset
digest in the same change. Do not merely update the digest to silence a failure.
Supplemental or procedural artwork changes need equivalent component anchors
and visual review before claiming new configuration coverage.

## Verification record

2026-10-19: 10,508 unit tests passed (31 skipped); TypeScript passed; three
browser scenarios passed with desktop, phone, and print screenshots reviewed.
The full suite caught an unavailable FontFaceSet in simulated DOM tests; the
optional font-readiness hook now handles that environment. Production build and
live contract verification are recorded in the task handoff after release.
