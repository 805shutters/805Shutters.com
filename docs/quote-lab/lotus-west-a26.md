# Lotus West A26.v1 Cost Book Audit

## Source

- File: `Lotus.pdf`
- Document title: `Cost Book & Supplier Manual`
- Revision: `West A26.v1`
- Effective date: undefined; the source does not state one
- PDF creation/modification date: `2026-04-01`
- Received: `2026-07-20`
- Pages: 113
- SHA-256: `4e9aba91a601e1212a3e8a1531c361caf033c28ef6ca1fdac3ad6247502a982f`
- Price basis: dealer-net supplier cost; customer retail is not defined

All 113 rendered pages were visually reviewed. `scripts/import-lotus-catalog.py` checks the PDF hash and page count, extracts every stock row and custom matrix, and refuses `--check` when the committed catalog differs from the source extraction.

## Quote Taxonomy

One top-level category is added: `Vinyl Blinds`.

| Quote category | Manufacturer/product choice | Source coverage |
| --- | --- | --- |
| Vinyl Blinds | Lotus Vinyl Blinds | 1-inch Vinyl, 1-inch Vinyl Plus, 2-inch Vinyl Plus |
| Mini Blinds | Norman or Lotus | Lotus 1-inch Aluminum Mini Blind |
| Faux Wood Blinds | Norman or Lotus | Seven Lotus smooth, embossed, privacy, color, and slat-size programs |
| Roller Shades | Norman, Polar, or Lotus | Independent Lotus 1% and Blackout Roller Shade grids |
| Vertical Blinds | Norman or Lotus | Lotus steel/aluminum complete systems, headrails, and vanes |

The existing quote-builder interface is unchanged except for the new category button and the expanded required `Manufacturer / product` selector. A shared category with multiple catalog products never defaults silently.

## Transcribed Coverage

- 5 Lotus product families
- 20 custom-cut programs, including the independently identified Blackout program
- 3,206 stock SKU/color records from pages 5-94
- 1,496 custom matrix cells from pages 95-108
- 1,494 priced dealer-net matrix cells
- 86 blank or source-directed blocked cells
- 1,723 custom matrix SKU codes
- Crown, Standard, and Designer Faux Wood valances
- Steel and aluminum headrails, one-way and center-draw systems, and vertical vanes

## Ordering Rules

- Stock sizes are subject to change (PDF p2).
- Broken packages add 25% dealer-net cost. The exception is 2-inch and 2.5-inch Faux Wood and 2-inch Vinyl Plus, which may be purchased by the piece (PDF p2).
- Dealer-net merchandise orders under $50 add a $5 small-order charge (PDF p2).
- Freight is prepaid only for orders exceeding $2,500. Freight at or below $2,500 is not stated and remains unresolved (PDF p2).
- Horizontal stock blinds are 1/2 inch narrower than stated. No more than 10 inches may be removed from a cordless horizontal blind's stock length (PDF p2).
- Lotus Roller Shades are 1/8 inch narrower than stated (PDF p83).
- Custom measurements round independently upward to the next width and height matrix cells.
- Blank cells and cells directing `Use RLX`, `Use FLX or FCX`, `Use Two Blinds`, or `Use Two Shades` are stored as unavailable. The engine never performs the directed substitution automatically.

## Golden Dealer Costs

These amounts are internal cost verification only and do not become customer retail.

| Configuration | Source calculation | Dealer-net cost |
| --- | --- | ---: |
| 1-inch Vinyl Mini Blind, 17 x 36 | PDF p95, 17 x 36 | $14.47 |
| 1-inch Aluminum Mini Blind, 30 x 48 | PDF p97, 30 x 48 | $24.30 |
| Aluminum Mini Blind, 30.01 x 48.01 | PDF p97, round to 35 x 60 | $27.84 |
| 2-inch Smooth Bright White Faux Wood, 35 x 60 | PDF p99, 35 x 60 | $34.77 |
| 1% Roller Shade, 30 x 48 | PDF p105, 30 x 48 | $35.02 |
| Steel Vertical Blind, 60 x 72 | PDF p106, 60 x 72 | $51.00 |
| Steel Headrail, 60 inches | PDF p106, width-only row | $24.60 |
| Custom Vertical Vanes, 48-inch length | PDF p108, vane-only row | $65.92 |
| Stock MLX3560WH, 35 x 60 White | PDF p8, carton 6 | $9.77 each |

## Source Limits And Uncertainties

- The manufacturer book provides no customer retail multiplier or suggested
  retail prices. On 2026-07-27, 805 supplied the explicit policy that every
  independent Lotus product model uses customer retail equal to three times
  its source wholesale grid.
- Blackout Roller Shades appear on page 83, but pages 84-87 and custom matrix
  page 105 price only 1% fabric. By owner instruction, Blackout keeps its own
  independent program/grid identity with the same wholesale cells as the 1%
  Roller Shade grid and uses the same three-times-wholesale retail rule.
- Freight cost at or below $2,500 is absent, so landed cost remains incomplete.
- Stock availability is explicitly variable; catalog inclusion does not prove current warehouse inventory.
- The custom vertical-vane matrix on page 108 does not define whether each amount is for one vane or a casepack. It is retained as dealer-net source data but not used for customer totals.
- The book provides no motorization, controls, remotes, sensors, percentage retail surcharges, or dealer discount multiplier.
- The PDF does not state a document effective date. `West A26.v1` is recorded as the revision and `2026-04-01` only as PDF creation/modification metadata.
