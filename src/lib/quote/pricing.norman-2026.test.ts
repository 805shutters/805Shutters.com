import { describe, expect, it } from "vitest";
import normanCatalog from "./catalog/norman-2026.catalog.json";
import { getMotorizationGroupsForProduct } from "./product-options";
import { priceDesign, type PriceResult } from "./pricing";

function priced(result: PriceResult) {
  if (!result.ok) throw new Error(`${result.code}: ${result.error}`);
  return result;
}

describe("Norman July 2026 source provenance", () => {
  it("records the exact source, effective date, hash, and 0.30 dealer policy", () => {
    expect(normanCatalog.effectiveDate).toBe("2026-07-01");
    expect(normanCatalog.sources).toEqual([
      expect.objectContaining({
        file: "2026Jul Retail Price Guide (1).pdf",
        revision: "2026-07",
        effectiveDate: "2026-07-01",
        pages: 40,
        sha256: "ae102c19b833e5c20070c11ecaad61d68a79bf6b52b5402fad55415e2602d2f3",
      }),
    ]);
    expect(normanCatalog.products).toHaveLength(13);
    for (const product of normanCatalog.products) {
      expect(product.manufacturer, product.id).toBe("Norman");
      expect(product.priceBasis, product.id).toBe("suggested_retail");
      expect(product.dealerFactor, product.id).toBe(0.3);
      expect(product.source, product.id).toBe("2026Jul Retail Price Guide (1).pdf");
      for (const program of product.programs) {
        expect(program.sourcePages?.length, program.id).toBeGreaterThan(0);
      }
      for (const surcharge of product.surcharges) {
        expect(surcharge.sourcePages?.length, `${product.id}/${surcharge.id}`).toBeGreaterThan(0);
      }
    }
    expect(normanCatalog.globalRules.surcharges.every((rule) => rule.dealerFactor === 1)).toBe(true);
  });

  it("calculates the first orderable cell of every guide product at retail x 0.30", () => {
    for (const product of normanCatalog.products) {
      const program = product.programs[0];
      let rowIndex = 0;
      let columnIndex = program.grid.prices[0].findIndex((price) => price != null);
      while (columnIndex < 0) {
        rowIndex += 1;
        columnIndex = program.grid.prices[rowIndex].findIndex((price) => price != null);
      }
      const result = priced(priceDesign({
        productId: product.id,
        programId: program.id,
        widthInches: program.grid.widths[columnIndex],
        heightInches: program.priceAxis === "width" ? 0 : program.grid.heights[rowIndex],
      }));
      expect(result.wholesaleBase, product.id).toBe(Math.round(result.base * 0.3 * 100) / 100);
    }
  });

  it("does not claim the July guide validates Norman shutters", () => {
    expect(normanCatalog.products.some((product) => product.id === "norman_shutters")).toBe(false);
  });
});

describe("Norman multi-shade quantity rules", () => {
  it("prices a Dual Roller as two shades plus the $73 lift surcharge", () => {
    const result = priced(priceDesign({
      productId: "roller",
      fabric: "Callie",
      widthInches: 24,
      heightInches: 36,
      surcharges: [{ id: "dual_shade" }],
    }));
    expect(result.configurationUnits).toBe(2);
    expect(result.base).toBe(508); // PDF p18: $254 x 2
    expect(result.surchargeLines[0].amount).toBe(73); // PDF p20
    expect(result.total).toBe(581);
    expect(result.wholesaleTotal).toBe(174.3);
  });

  it("prices three coupled shades as three bases plus two $117 surcharges", () => {
    const result = priced(priceDesign({
      productId: "roller",
      fabric: "Callie",
      widthInches: 24,
      heightInches: 36,
      surcharges: [{ id: "coupled_shade", units: 2 }],
    }));
    expect(result.configurationUnits).toBe(3);
    expect(result.base).toBe(762); // PDF p18: $254 x 3
    expect(result.surchargeLines[0].amount).toBe(234); // PDF p20: $117 x 2
    expect(result.total).toBe(996);
    expect(result.wholesaleTotal).toBe(298.8);
  });

  it("sums each exact Roller component grid cell before adding the coupled charge", () => {
    const single = priced(priceDesign({
      productId: "roller",
      fabric: "Brook",
      widthInches: 24,
      heightInches: 60,
    }));
    const assembly = priced(priceDesign({
      productId: "roller",
      fabric: "Brook",
      widthInches: 72,
      heightInches: 60,
      componentWidthsInches: [24, 24, 24],
      surcharges: [{ id: "coupled_shade", units: 2 }],
    }));

    expect(single.base).toBe(296);
    expect(assembly.componentMatchedWidths).toEqual([24, 24, 24]);
    expect(assembly.configurationUnits).toBe(3);
    expect(assembly.base).toBe(single.base * 3);
    expect(assembly.surchargeLines).toContainEqual(
      expect.objectContaining({ id: "coupled_shade", amount: 234 }),
    );
    expect(assembly.total).toBe(single.base * 3 + 234);
  });

  it("prices SmartFit Dual as two honeycomb shades plus the source surcharge", () => {
    const result = priced(priceDesign({
      productId: "honeycomb",
      programId: "honeycomb_9_16in_cordless_single_cell",
      widthInches: 24,
      heightInches: 36,
      surcharges: [{ id: "smartfit_dual_shade" }],
    }));
    expect(result.configurationUnits).toBe(2);
    expect(result.base).toBe(424); // PDF p10: $212 x 2
    expect(result.total).toBe(602); // + $178, PDF p10
    expect(result.wholesaleTotal).toBe(180.6);
  });

  it("doubles only the drive motor for a Dual Roller", () => {
    const result = priced(priceDesign({
      productId: "roller",
      fabric: "Callie",
      widthInches: 24,
      heightInches: 36,
      surcharges: [{ id: "dual_shade" }],
      motorization: [
        { groupId: "smart_motorization", optionId: "motor" },
        { groupId: "smart_motorization", optionId: "smartdial_g2_remote" },
      ],
    }));
    expect(result.surchargeLines.find((line) => line.id.endsWith(":motor"))?.amount).toBe(964);
    expect(result.surchargeLines.find((line) => line.id.endsWith(":smartdial_g2_remote"))?.amount).toBe(268);
    expect(result.total).toBe(1813); // $508 base + $73 dual + $964 motors + $268 remote
  });
});

describe("Norman motor applicability", () => {
  it("matches the product columns on PDF pages 6, 7, 8, and 28", () => {
    expect(getMotorizationGroupsForProduct("honeycomb")).toEqual(["automate_home", "autowand", "smart_motorization"]);
    expect(getMotorizationGroupsForProduct("smartfold")).toEqual(["autowand", "smart_motorization"]);
    expect(getMotorizationGroupsForProduct("smartdrape")).toEqual(["smart_motorization"]);
    expect(getMotorizationGroupsForProduct("vertical_honeycomb")).toEqual([]);
    expect(getMotorizationGroupsForProduct("synchrony_vertical")).toEqual([]);
  });

  it("adds the previously missing $60 SmartSense only to Roller and SmartFold", () => {
    const roller = priced(priceDesign({
      productId: "roller",
      fabric: "Callie",
      widthInches: 24,
      heightInches: 36,
      motorization: [{ groupId: "smart_motorization", optionId: "smartsense" }],
    }));
    expect(roller.surchargeLines[0]).toMatchObject({ amount: 60, wholesaleAmount: 18 });

    const unsupported = priceDesign({
      productId: "honeycomb",
      programId: "honeycomb_9_16in_cordless_single_cell",
      widthInches: 24,
      heightInches: 36,
      motorization: [{ groupId: "smart_motorization", optionId: "smartsense" }],
    });
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) expect(unsupported.code).toBe("MOTORIZATION_UNKNOWN");
  });
});
