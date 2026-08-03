import { describe, expect, it } from "vitest";
import { catalog } from "./catalog";
import { priceDealerNetDesign, priceDesign } from "./pricing";

describe("Polar quote-only policy", () => {
  it("fails closed for every Polar product without returning retail or dealer cost", () => {
    const products = catalog.products.filter(
      (product) => product.manufacturer === "Polar" || product.id.startsWith("polar_"),
    );
    expect(products.length).toBeGreaterThan(0);

    for (const product of products) {
      const input = {
        productId: product.id,
        programId: product.programs[0]?.id,
        widthInches: 48,
        heightInches: 72,
      };
      expect(priceDesign(input)).toMatchObject({
        ok: false,
        code: "MANUAL_PRICE_REQUIRED",
      });
      expect(priceDealerNetDesign(input)).toMatchObject({
        ok: false,
        code: "MANUAL_PRICE_REQUIRED",
      });
    }
  });

  it("blocks a previously priceable source coordinate before grid lookup", () => {
    const result = priceDesign({
      productId: "polar_interior_roller",
      programId: "group_1",
      widthInches: 24,
      heightInches: 36,
    });
    expect(result).toMatchObject({ ok: false, code: "MANUAL_PRICE_REQUIRED" });
    if (!result.ok) expect(result.error).toContain("QUOTE ONLY");
  });
});
