# Contract artwork follow-up

Completed locally: manufacturer photo research, 16 C graphite valance profiles, eight angled shutter variants, manufacturer-aware selection resolution, builder/staff/customer/print rendering, development preview, and focused/full validation.

Release step: publish this reviewed change from main and verify the production deployment and actual contract UI. Deployment evidence is recorded outside the source tree after publication.

The valance resolver consumes existing order selections and Polar fascia/head-pocket surcharge IDs. It never adds pricing options, infers an unknown manufacturer, or substitutes another manufacturer's profile. Customer-facing labels remain unbranded; public line items carry the resolved artwork identity so branding cleanup cannot lose the visual. Signed snapshots preserve that identity. This change does not alter quote amounts or ordering data.

Photo provenance, final asset hashes, and built-in generation prompts: `contract-valance-artwork.json` and `contract-shutter-angled-artwork.json`. Final assets are under `public/images/contract-illustrations/valances-c-v1/` and `public/images/contract-illustrations/c-v1/`.

## Verified coverage

- Norman Soluna: fabric, modern wood, plain curved fascia, fabric-covered curved fascia, square fascia, curved cassette, square cassette.
- Norman blinds: Contempo and Designer Crown.
- Polar interior: L fascia, fabric-wrapped fascia, curved cassette, square cassette, head pocket.
- Lotus faux wood: Crown and Beaded.
- Shutters: center/hidden tilt with plain, split tilt, divider rail, and split plus divider variants; counts 1–8; no offset tilt. Product alone, subtle angled view. Old front-view assets remain available for older references.

## Profiles awaiting reliable identification

Onyx's current public shade collection does not identify valance styles. The owner's dealer page or exact ordering names are needed. Ambiguous generic Polar “Interior Cassette” does not establish square versus curved; no sketch is inferred. Exterior cassettes/hoods, discontinued Lotus Designer/Standard names, legacy Roman valances and other unverified profiles remain text-only pending exact manufacturer photo/profile confirmation. “No Valance,” unknown manufacturer, unsupported product, and conflicting selections intentionally produce no additional sketch.

Development preview: `/quote/artwork-preview/` (404 in production). Added loopback development origins and development-only eval support so Next's interactive preview hydrates; production CSP remains unchanged.
