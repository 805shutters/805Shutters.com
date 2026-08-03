import { describe, expect, it } from "vitest";
import { listProducts } from "./catalog";
import { priceDealerNetDesign, priceDesign } from "./pricing";

describe("Polar quote-only launch policy", () => {
  const polarProducts = listProducts().filter(
    (product) => product.manufacturer === "Polar" || product.id.startsWith("polar_"),
  );

  it("blocks retail and dealer-cost pricing for every Polar product", () => {
    expect(polarProducts.length).toBeGreaterThan(0);
    for (const product of polarProducts) {
      const programId = product.programs[0]?.id;
      const input = {
        productId: product.id,
        programId,
        widthInches: 48,
        heightInches: 72,
      };
      expect(priceDesign(input), product.id).toMatchObject({
        ok: false,
        code: "MANUAL_PRICE_REQUIRED",
      });
      expect(priceDealerNetDesign(input), product.id).toMatchObject({
        ok: false,
        code: "MANUAL_PRICE_REQUIRED",
      });
    }
  });

  it("does not expose a price even when a known grid coordinate is supplied", () => {
    expect(priceDesign({
      productId: "polar_interior_roller",
      programId: "group_1",
      widthInches: 24,
      heightInches: 36,
    })).toMatchObject({
      ok: false,
      code: "MANUAL_PRICE_REQUIRED",
      error: expect.stringContaining("QUOTE ONLY"),
    });
  });
});
