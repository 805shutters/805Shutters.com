import { describe, expect, it } from "vitest";
import { catalog, getProduct } from "./catalog";
import { priceDealerNetDesign, priceDesign } from "./pricing";

describe("Lotus West A26.v1 cost catalog with owner-approved retail", () => {
  it("records the complete source identity and independent x3 retail policy", () => {
    const source = catalog.sources?.find((item) => item.file === "Lotus.pdf");
    expect(source).toMatchObject({
      title: "Cost Book & Supplier Manual",
      revision: "West A26.v1",
      effectiveDate: null,
      modifiedDate: "2026-04-01",
      pages: 113,
      sha256: "4e9aba91a601e1212a3e8a1531c361caf033c28ef6ca1fdac3ad6247502a982f",
    });
    const lotus = catalog.products.filter((product) => product.manufacturer === "Lotus");
    expect(lotus).toHaveLength(5);
    expect(lotus.every((product) => product.priceBasis === "suggested_retail")).toBe(true);
    expect(lotus.every((product) => product.customerRetailStatus === "verified")).toBe(true);
    expect(lotus.every((product) => product.retailPolicy?.kind === "cost_multiplier")).toBe(true);
    expect(lotus.every((product) => product.retailPolicy?.value === 3)).toBe(true);
    expect(lotus.reduce((count, product) => count + (product.stockItems?.length ?? 0), 0)).toBe(3206);
  });

  it.each([
    ["lotus_mlx_1in_vinyl_custom", 17, 36, 17, 36, 14.47, "PDF p95"],
    ["lotus_amx_1in_aluminum_custom", 30, 48, 30, 48, 24.3, "PDF p97"],
    ["lotus_flx_2in_bright_white_custom", 35, 60, 35, 60, 34.77, "PDF p99"],
    ["lotus_rs_1pct_custom", 30, 48, 30, 48, 35.02, "PDF p105"],
    ["lotus_cv_steel_complete_custom", 60, 72, 60, 72, 51, "PDF p106"],
  ])("matches %s golden cost", (programId, width, height, matchedWidth, matchedHeight, cost, _source) => {
    const product = catalog.products.find((candidate) => candidate.programs.some((program) => program.id === programId))!;
    expect(priceDealerNetDesign({ productId: product.id, programId, widthInches: width, heightInches: height })).toEqual({
      ok: true,
      productId: product.id,
      programId,
      matchedWidth,
      matchedHeight,
      dealerNetBaseCost: cost,
      dealerNetOptionLines: [],
      dealerNetUnitCost: cost,
      quantity: 1,
      dealerNetOnceCost: 0,
      dealerNetTotalCost: cost,
    });
  });

  it("rounds each custom-cut dimension upward without choosing a cheaper cell", () => {
    expect(priceDealerNetDesign({
      productId: "lotus_mini_blinds",
      programId: "lotus_amx_1in_aluminum_custom",
      widthInches: 30.01,
      heightInches: 48.01,
    })).toMatchObject({ ok: true, matchedWidth: 35, matchedHeight: 60, dealerNetUnitCost: 27.84 });
  });

  it("enforces Lotus max width, max height, and max area before grid rounding", () => {
    const baseInput = {
      productId: "lotus_mini_blinds",
      programId: "lotus_amx_1in_aluminum_custom",
    } as const;
    expect(priceDealerNetDesign({
      ...baseInput,
      widthInches: 95,
      heightInches: 36,
    })).toMatchObject({ ok: true, matchedWidth: 95, matchedHeight: 36 });
    expect(priceDealerNetDesign({
      ...baseInput,
      widthInches: 95.01,
      heightInches: 36,
    })).toMatchObject({ ok: false, code: "WIDTH_EXCEEDS_MAX" });
    expect(priceDealerNetDesign({
      ...baseInput,
      widthInches: 17,
      heightInches: 108,
    })).toMatchObject({ ok: true, matchedWidth: 17, matchedHeight: 108 });
    expect(priceDealerNetDesign({
      ...baseInput,
      widthInches: 17,
      heightInches: 108.01,
    })).toMatchObject({ ok: false, code: "HEIGHT_EXCEEDS_MAX" });

    const product = getProduct("lotus_mini_blinds");
    const program = product?.programs.find(
      (entry) => entry.id === "lotus_amx_1in_aluminum_custom",
    );
    if (!program) throw new Error("Expected the Lotus AMX source program.");
    const originalMaxAreaSqft = program.maxAreaSqft;
    try {
      program.maxAreaSqft = 20;
      expect(priceDealerNetDesign({
        ...baseInput,
        widthInches: 60,
        heightInches: 48,
      })).toMatchObject({ ok: true, matchedWidth: 63, matchedHeight: 48 });
      expect(priceDealerNetDesign({
        ...baseInput,
        widthInches: 60,
        heightInches: 48.01,
      })).toMatchObject({ ok: false, code: "AREA_EXCEEDS_MAX" });
    } finally {
      program.maxAreaSqft = originalMaxAreaSqft;
    }
  });

  it("blocks source-directed substitutions and prices Blackout from the owner-approved identical 1% grid", () => {
    expect(priceDealerNetDesign({
      productId: "lotus_vinyl_blinds",
      programId: "lotus_mlx_1in_vinyl_custom",
      widthInches: 69,
      heightInches: 96,
    })).toMatchObject({ ok: false, code: "NA_CELL" });
    expect(priceDealerNetDesign({
      productId: "lotus_roller_shades",
      programId: "lotus_rs_blackout_unpriced",
      widthInches: 36,
      heightInches: 60,
    })).toMatchObject({ ok: true, dealerNetUnitCost: 47.07 });
    expect(priceDesign({
      productId: "lotus_roller_shades",
      programId: "lotus_rs_blackout_unpriced",
      widthInches: 36,
      heightInches: 60,
    })).toMatchObject({ ok: true, base: 141.21, unitPrice: 141.21 });
  });

  it("prices customer retail at exactly three times internal source cost", () => {
    expect(priceDesign({
      productId: "lotus_mini_blinds",
      programId: "lotus_amx_1in_aluminum_custom",
      widthInches: 30,
      heightInches: 48,
    })).toMatchObject({ ok: true, base: 72.9, unitPrice: 72.9 });
    expect(priceDealerNetDesign({
      productId: "lotus_mini_blinds",
      programId: "lotus_amx_1in_aluminum_custom",
      widthInches: 30,
      heightInches: 48,
    })).toMatchObject({ ok: true, dealerNetUnitCost: 24.3 });
  });

  it("retains dealer-net order rules without treating them as retail", () => {
    expect(catalog.globalRules.surcharges.find((item) => item.id === "lotus_broken_package")).toMatchObject({
      value: null,
      dealerNetValue: 25,
    });
    expect(catalog.globalRules.surcharges.find((item) => item.id === "lotus_small_order")).toMatchObject({
      value: null,
      dealerNetValue: 5,
    });
  });

  it("keeps stock items server-side with carton and source provenance", () => {
    const product = getProduct("lotus_vinyl_blinds")!;
    expect(product.stockItems?.find((item) => item.sku === "MLX3560WH")).toMatchObject({
      width: 35,
      height: 60,
      cartonQty: 6,
      dealerNetPrice: 9.77,
      sourcePage: 8,
    });
  });
});
