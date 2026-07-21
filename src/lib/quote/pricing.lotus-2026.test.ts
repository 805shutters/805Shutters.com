import { describe, expect, it } from "vitest";
import { catalog, getProduct } from "./catalog";
import { priceDealerNetDesign, priceDesign } from "./pricing";

describe("Lotus West A26.v1 dealer-net catalog", () => {
  it("records the complete source identity and dealer-net boundary", () => {
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
    expect(lotus.every((product) => product.priceBasis === "dealer_net")).toBe(true);
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
      dealerNetUnitCost: cost,
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

  it("blocks source-directed substitutions and missing Blackout pricing", () => {
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
    })).toMatchObject({ ok: false, code: "MANUAL_PRICE_REQUIRED" });
  });

  it("blocks customer retail while retaining internal source cost", () => {
    expect(priceDesign({
      productId: "lotus_mini_blinds",
      programId: "lotus_amx_1in_aluminum_custom",
      widthInches: 30,
      heightInches: 48,
    })).toMatchObject({ ok: false, code: "CUSTOMER_RETAIL_UNDEFINED" });
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
