# Contract product illustrations

Approved direction: **C — Soft shaded graphite**. Artwork is selected automatically from the same product and labeled specifications displayed on the contract. No staff image picker.

## Task plan / acceptance checks

- [x] Export the approved C quadrant for all ten product types, the upright remote, and five side-specific variants.
- [x] Integrate a shared illustration component into the active builder, staff contract, and shared customer/mobile/print contract renderer.
- [x] Persist roller control side and blind wand side through existing design fields; preserve honeycomb chain location at the V2 public boundary.
- [x] Pass focused regression tests, full tests, typecheck, and production build.
- [x] Inspect actual rendered contracts at desktop, iPad, and phone sizes.
- [ ] Review and publish only this change; verify the production result.

## Artwork behavior

Roller and honeycomb support cordless, continuous cord loop left/right, and motorized. Roman and sheer support the approved cordless/motorized artwork. Faux wood, wood, and mini blinds use the selected wand side, with no strings, tape, or route holes. Wood/mini right-side views mirror their approved left-side drawing. Motorized shade artwork has an upright generic control underneath with no visible caption. Product headings use stronger 14px type (13px on phones).

Left/right means viewed from inside the room. Missing or conflicting control sides, unknown operating systems, and specialized configurations without approved art omit the illustration; written contract specifications remain authoritative. No operation or side is silently defaulted. AutoWand does not receive a remote drawing. No pricing, tax, discount, signature, send, or historical document records are rewritten.

## QA inventory

- Roller and honeycomb: cordless -> loop left -> loop right -> motorized -> cordless. Drawing, written options, remote presence, and total remain consistent.
- Faux wood, wood, mini: left -> right -> left; wand direction and no pull cords.
- All ten product types: approved C artwork loads, product is fully visible, no window background.
- Alternative designs: each retains its own configuration and drawing.
- Missing side and unknown/specialty operation: no misleading fallback drawing.
- Remote is below the product, upright, without a visible caption.
- Desktop, iPad, phone, and print layout: legible label, no clipping/overflow or cropped artwork.
- Customer, totals, signed/partial selections and send/sign behavior: existing regressions pass.

## Asset provenance

`public/images/contract-illustrations/c-v1/manifest.json` records each source board basename and SHA-256, chosen bottom-left C quadrant, and exported asset. Versioned local WebP assets keep the product artwork independent of vendor image URLs.

## Local verification

The full test suite, typecheck, and production build passed. The actual customer renderer was exercised through `/quote/artwork-preview/` (development-only; production returns 404) with in-memory sample data. Desktop, 834px iPad, 390px phone, and print media were inspected. Tests covered operation transitions, side changes, missing side, alternative designs, unchanged totals, and image loading. This route does not load, save, sign, or send customer records.
