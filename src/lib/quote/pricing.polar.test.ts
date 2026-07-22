import { describe, expect, it } from "vitest";
import {
  priceDealerNetDesign,
  priceDesign,
  type PriceResult,
} from "./pricing";
import { catalog, getProduct } from "./catalog";

function ok(result: PriceResult) {
  if (!result.ok) throw new Error(`${result.code}: ${result.error}`);
  return result;
}

describe("Polar Shades dealer book golden quotes", () => {
  it("records the received CURRENT source without inventing an effective date", () => {
    expect(catalog.sources).toContainEqual({
      sourceId: "polar-shades-dealer-book-current-2026-07-18",
      file: "_Polar Shades Dealer Book - CURRENT.pdf",
      title: "Interior & Exterior Shades Pricing & Reference Guide",
      revision: "CURRENT",
      effectiveDate: null,
      receivedDate: "2026-07-20",
      modifiedDate: "2026-07-18",
      pages: 246,
      sha256: "52eb859d583174c311e9682a09da3c33f8d081b2e772866a40dc025e2dcd0b0e",
    });
  });

  it("keeps both All Seasons cells exclusively as dealer cost", () => {
    const product = getProduct("polar_all_seasons_screen");
    expect(product?.priceBasis).toBe("dealer_net");
    const cases = [
      ["single_48x96", 48, 96, 375],
      ["double_72x96", 72, 96, 700],
    ] as const;

    for (const [programId, widthInches, heightInches, expectedCost] of cases) {
      const program = product?.programs.find((entry) => entry.id === programId);
      expect(program?.priceGroup, programId).toBeNull();
      expect(program?.grid.prices, `${programId} customer retail`).toEqual([[null]]);
      expect(program?.grid.costs, `${programId} dealer cost`).toEqual([[expectedCost]]);
      expect(priceDealerNetDesign({
        productId: "polar_all_seasons_screen",
        programId,
        widthInches,
        heightInches,
      })).toMatchObject({
        ok: true,
        dealerNetUnitCost: expectedCost,
        matchedWidth: widthInches,
        matchedHeight: heightInches,
      });
      expect(priceDesign({
        productId: "polar_all_seasons_screen",
        programId,
        widthInches,
        heightInches,
      })).toMatchObject({
        ok: false,
        code: "CUSTOMER_RETAIL_UNDEFINED",
      });
    }

    expect(product?.surcharges).toContainEqual({
      id: "sliding_glass_door",
      name: "Sliding Glass Door",
      kind: "flat",
      per: "unit",
      value: null,
      dealerNetValue: 25,
      sourceId: "polar-shades-dealer-book-current-2026-07-18",
      appliesTo: "all",
      notes: "$25 is published dealer-net cost. Customer retail is undefined.",
      sourceType: "Polar dealer book",
      sourcePages: [88],
    });
    expect(priceDealerNetDesign({
      productId: "polar_all_seasons_screen",
      programId: "single_48x96",
      widthInches: 48,
      heightInches: 96,
      quantity: 2,
      surcharges: [{ id: "sliding_glass_door" }],
    })).toMatchObject({
      ok: true,
      dealerNetBaseCost: 375,
      dealerNetOptionLines: [
        {
          id: "sliding_glass_door",
          amount: 25,
          billingScope: "per_window",
          sourceId: "polar-shades-dealer-book-current-2026-07-18",
        },
      ],
      dealerNetUnitCost: 400,
      quantity: 2,
      dealerNetTotalCost: 800,
    });
  });

  it("enforces All Seasons exact min/max dimensions before grid rounding", () => {
    const priceSingle = (widthInches: number, heightInches: number) =>
      priceDealerNetDesign({
        productId: "polar_all_seasons_screen",
        programId: "single_48x96",
        widthInches,
        heightInches,
      });

    expect(priceSingle(48, 96)).toMatchObject({
      ok: true,
      matchedWidth: 48,
      matchedHeight: 96,
      dealerNetUnitCost: 375,
    });
    expect(priceSingle(47.99, 96)).toMatchObject({
      ok: false,
      code: "INVALID_DIMENSIONS",
    });
    expect(priceSingle(48, 95.99)).toMatchObject({
      ok: false,
      code: "INVALID_DIMENSIONS",
    });
    expect(priceSingle(48.01, 96)).toMatchObject({
      ok: false,
      code: "WIDTH_EXCEEDS_MAX",
    });
    expect(priceSingle(48, 96.01)).toMatchObject({
      ok: false,
      code: "HEIGHT_EXCEEDS_MAX",
    });
  });

  it("prices the minimum Interior group 1 cell from p26 and applies dealer factor", () => {
    const result = ok(priceDesign({ productId: "polar_interior_roller", programId: "group_1", widthInches: 24, heightInches: 36 }));
    expect(result.base).toBe(110);
    expect(result.wholesaleBase).toBe(49.5);
    expect(result.total).toBe(110);
    expect(result.costStatus).toBe("incomplete");
    expect(result.warnings.join(" ")).toMatch(/freight/i);
  });

  it("rounds each between-grid dimension upward: p26 group 1 25x37 -> 30x42 = $134", () => {
    const result = ok(priceDesign({ productId: "polar_interior_roller", programId: "group_1", widthInches: 25, heightInches: 37 }));
    expect([result.matchedWidth, result.matchedHeight, result.base]).toEqual([30, 42, 134]);
  });

  it("prices a typical p28 group 3 shade and quantity without altering unit cost", () => {
    const result = ok(priceDesign({ productId: "polar_interior_roller", programId: "group_3", widthInches: 50, heightInches: 70, quantity: 4 }));
    expect([result.matchedWidth, result.matchedHeight]).toEqual([54, 72]);
    expect(result.unitPrice).toBe(282);
    expect(result.total).toBe(1128);
    expect(result.wholesaleTotal).toBe(507.6);
  });

  it("prices the maximum Interior group 14 p39 cell exactly", () => {
    const result = ok(priceDesign({ productId: "polar_interior_roller", programId: "group_14", widthInches: 288, heightInches: 168 }));
    expect(result.base).toBe(19043);
    expect(result.wholesaleBase).toBe(8569.35);
  });

  it("adds manual accessories from p26 and height-graduated side channels", () => {
    const result = ok(priceDesign({
      productId: "polar_interior_roller", programId: "group_1", widthInches: 24, heightInches: 36,
      surcharges: [{ id: "side_channels" }, { id: "bottom_up" }, { id: "fascia_3" }],
    }));
    expect(result.surchargeLines.map((line) => [line.id, line.amount])).toEqual([
      ["side_channels", 77], ["bottom_up", 275], ["fascia_3", 44],
    ]);
    expect(result.unitPrice).toBe(506);
    expect(result.wholesaleUnitPrice).toBe(227.7);
  });

  it("covers the Interior, Elite, Titan, Mega, and drapery motor families", () => {
    const cases = [
      ["polar_interior_roller", "group_1", 24, 36, "polar_interior_motors", "motor_506_standard", 561],
      ["polar_elite_patio", "group_1", 48, 36, "polar_elite_motors", "motor_510_altus", 907],
      ["polar_titan_patio", "group_1", 72, 36, "polar_titan_motors", "motor_525_altus", 898],
      ["polar_mega_exterior", "group_1", 204, 36, "polar_mega_motors", "motor_525_altus", 907],
      ["polar_drapery_track", "pinch_split_white", 48, 0, "polar_drapery_motors", "glydea_60_rts", 1345],
    ] as const;
    for (const [productId, programId, widthInches, heightInches, groupId, optionId, addition] of cases) {
      const base = ok(priceDesign({ productId, programId, widthInches, heightInches }));
      const motorized = ok(priceDesign({ productId, programId, widthInches, heightInches, motorization: [{ groupId, optionId }] }));
      expect(motorized.unitPrice, `${productId}/${optionId}`).toBe(base.base + addition);
    }
  });

  it("prices representative exterior and awning grids at source coordinates", () => {
    expect(ok(priceDesign({ productId: "polar_titan_patio", programId: "group_7", widthInches: 130, heightInches: 130 })).base).toBe(2653); // p123 -> 132x132
    expect(ok(priceDesign({ productId: "polar_mega_exterior", programId: "group_2", widthInches: 250, heightInches: 107 })).base).toBe(4430); // p147 -> 252x108
    expect(ok(priceDesign({ productId: "polar_awning_premium_pro", programId: "standard", widthInches: 120, heightInches: 83 })).base).toBe(4900); // p165
    expect(ok(priceDesign({ productId: "polar_awning_select", programId: "standard", widthInches: 100, heightInches: 102 })).base).toBe(3105); // p171 -> 9ft x 8ft6
    expect(ok(priceDesign({ productId: "polar_awning_drop_arm", programId: "standard", widthInches: 37, heightInches: 40 })).base).toBe(1136); // p178 -> 4ft x 3ft11
  });

  it("keeps RAL custom color out of the 0.45 dealer discount", () => {
    const result = ok(priceDesign({ productId: "polar_elite_patio", programId: "group_1", widthInches: 48, heightInches: 36, surcharges: [{ id: "ral_custom_color" }] }));
    expect(result.base).toBe(415);
    expect(result.unitPrice).toBe(1915);
    expect(result.wholesaleUnitPrice).toBe(1686.75); // 415 x .45 + undiscounted 1500
  });

  it("requires the upper Vortex tier when a between-grid height rounds above 96 inches", () => {
    const wrong = priceDesign({ productId: "polar_elite_patio", programId: "group_1", widthInches: 48, heightInches: 100, surcharges: [{ id: "vortex_36_96" }] });
    expect(wrong.ok).toBe(false);
    const right = ok(priceDesign({ productId: "polar_elite_patio", programId: "group_1", widthInches: 48, heightInches: 100, surcharges: [{ id: "vortex_108_plus" }] }));
    expect(right.matchedHeight).toBe(108);
    expect(right.surchargeLines[0].amount).toBe(650);
  });

  it("blocks undefined, unavailable, unsupported, and null-cell configurations", () => {
    const failures = [
      priceDesign({ productId: "", widthInches: 48, heightInches: 96 }),
      priceDesign({ productId: "polar_tension_shade", widthInches: 48, heightInches: 96 }),
      priceDesign({ productId: "polar_all_seasons_screen", programId: "single_48x96", widthInches: 48, heightInches: 96 }),
      priceDesign({ productId: "polar_exterior_clutch_unavailable", widthInches: 48, heightInches: 96 }),
      priceDesign({ productId: "polar_titan_patio", programId: "group_1", widthInches: 216, heightInches: 197 }),
      priceDesign({ productId: "polar_mega_exterior", programId: "group_1", widthInches: 288, heightInches: 150, surcharges: [{ id: "vortex_108_plus" }] }),
      priceDesign({ productId: "polar_awning_select", programId: "standard", widthInches: 277, heightInches: 83 }),
    ];
    expect(failures.map((result) => result.ok ? "OK" : result.code)).toEqual([
      "PRODUCT_SELECTION_REQUIRED", "MANUAL_PRICE_REQUIRED", "CUSTOMER_RETAIL_UNDEFINED", "PRODUCT_UNAVAILABLE", "NA_CELL", "INVALID_DIMENSIONS", "WIDTH_EXCEEDS_MAX",
    ]);
  });

  it("contains all transcribed fabric records and expected price programs", () => {
    expect(getProduct("polar_interior_roller")?.fabricMetadata).toHaveLength(176);
    expect(getProduct("polar_elite_patio")?.fabricMetadata).toHaveLength(48);
    expect(getProduct("polar_interior_roller")?.programs).toHaveLength(14);
    expect(getProduct("polar_drapery_track")?.programs).toHaveLength(28);
  });
});
