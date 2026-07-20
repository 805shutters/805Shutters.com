import type { QuoteLabFixture } from "./types";

export const quoteLabFixtures: QuoteLabFixture[] = [
  {
    id: "woodlore-reference",
    name: "Woodlore reference window",
    description: "A normal 35 x 70 Woodlore shutter with a 20% line discount. Both engines should agree before options.",
    quote: {
      id: "fixture-woodlore-reference",
      name: "Woodlore reference window",
      lines: [
        {
          id: "living-room-window",
          room: "Living Room",
          quantity: 1,
          selectedDesignId: "woodlore-a",
          designs: [
            {
              id: "woodlore-a",
              label: "A",
              productId: "norman_shutters",
              programId: "woodlore",
              widthInches: 35,
              heightInches: 70,
              discountPercent: 20,
              surcharges: [],
              motorization: [],
            },
          ],
        },
      ],
    },
  },
  {
    id: "alternative-designs",
    name: "A/B alternatives",
    description: "One window with shutter and roller alternatives. The new total bills only A; the legacy total demonstrates sum-all-design behavior.",
    quote: {
      id: "fixture-alternatives",
      name: "Alternative design billing test",
      lines: [
        {
          id: "office-window",
          room: "Office",
          quantity: 1,
          selectedDesignId: "office-a",
          designs: [
            {
              id: "office-a",
              label: "A",
              productId: "norman_shutters",
              programId: "woodlore_plus",
              widthInches: 36,
              heightInches: 60,
              discountPercent: 0,
              surcharges: [],
              motorization: [],
            },
            {
              id: "office-b",
              label: "B",
              productId: "roller",
              programId: "roller_cordless_fabric_price_group_1_pg1",
              widthInches: 36,
              heightInches: 60,
              discountPercent: 0,
              surcharges: [],
              motorization: [],
            },
          ],
        },
      ],
    },
  },
  {
    id: "invalid-stale-price",
    name: "Invalid size with stale price",
    description: "A roller shade changed to an impossible width after previously holding a $500 price. The new engine blocks it; the legacy simulation retains the stale value.",
    quote: {
      id: "fixture-invalid-stale",
      name: "Invalid size stale-price guard",
      lines: [
        {
          id: "patio-door",
          room: "Patio Door",
          quantity: 1,
          selectedDesignId: "patio-a",
          designs: [
            {
              id: "patio-a",
              label: "A",
              productId: "roller",
              programId: "roller_cordless_fabric_price_group_1_pg1",
              widthInches: 200,
              heightInches: 84,
              discountPercent: 0,
              legacyStoredUnitPrice: 500,
              surcharges: [],
              motorization: [],
            },
          ],
        },
      ],
    },
  },
  {
    id: "browser-rate-drift",
    name: "Browser-local shutter rate",
    description: "Simulates one browser overriding Woodlore to $34/sq ft while the controlled price book remains $35/sq ft.",
    quote: {
      id: "fixture-rate-drift",
      name: "Browser-local rate divergence",
      lines: [
        {
          id: "bedroom-window",
          room: "Primary Bedroom",
          quantity: 2,
          selectedDesignId: "bedroom-a",
          designs: [
            {
              id: "bedroom-a",
              label: "A",
              productId: "norman_shutters",
              programId: "woodlore",
              widthInches: 36,
              heightInches: 60,
              discountPercent: 0,
              legacyRetailOverride: 34,
              surcharges: [],
              motorization: [],
            },
          ],
        },
      ],
    },
  },
  {
    id: "smartfold-coverage",
    name: "SmartFold coverage gap",
    description: "SmartFold exists in the verified catalog but is not handled by the active legacy pricing switch.",
    quote: {
      id: "fixture-smartfold",
      name: "SmartFold builder coverage",
      lines: [
        {
          id: "guest-room-window",
          room: "Guest Room",
          quantity: 1,
          selectedDesignId: "smartfold-a",
          designs: [
            {
              id: "smartfold-a",
              label: "A",
              productId: "smartfold",
              programId: "smartfold_smartfold_shades",
              widthInches: 48,
              heightInches: 72,
              discountPercent: 0,
              surcharges: [],
              motorization: [],
            },
          ],
        },
      ],
    },
  },
  {
    id: "oversize-order-costs",
    name: "Oversize order costs",
    description: "Two 96-inch roller shades. The customer price is shown separately from manufacturer freight and oversize net charges.",
    quote: {
      id: "fixture-oversize",
      name: "Oversize landed-cost reference",
      lines: [
        {
          id: "great-room-windows",
          room: "Great Room",
          quantity: 2,
          selectedDesignId: "oversize-a",
          designs: [
            {
              id: "oversize-a",
              label: "A",
              productId: "roller",
              programId: "roller_cordless_fabric_price_group_1_pg1",
              widthInches: 96,
              heightInches: 84,
              discountPercent: 0,
              surcharges: [],
              motorization: [],
            },
          ],
        },
      ],
    },
  },
  {
    id: "forty-line-quote",
    name: "40-line working quote",
    description: "A full-capacity quote that proves the familiar builder and authoritative backend can price forty independent line items together.",
    quote: {
      id: "fixture-forty-lines",
      name: "Forty-line whole-home quote",
      lines: Array.from({ length: 40 }, (_, index) => {
        const lineNumber = index + 1;
        const designId = `bulk-${lineNumber}-a`;
        return {
          id: `bulk-line-${lineNumber}`,
          room: `Room ${lineNumber}`,
          quantity: 1,
          selectedDesignId: designId,
          designs: [
            {
              id: designId,
              label: "A",
              productId: "roller",
              programId: "roller_cordless_fabric_price_group_1_pg1",
              widthInches: 30 + (index % 6) * 6,
              heightInches: 48 + (index % 5) * 6,
              discountPercent: 0,
              surcharges: [],
              motorization: [],
            },
          ],
        };
      }),
    },
  },
];

export function quoteLabFixture(id: string): QuoteLabFixture | undefined {
  return quoteLabFixtures.find((fixture) => fixture.id === id);
}
