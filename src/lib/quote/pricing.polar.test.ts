import { describe, expect, it } from "vitest";
import { priceDealerNetDesign, priceDesign } from "./pricing";

describe("Polar product-specific pricing policy", () => {
  it("keeps only Tension Shades quote-only", () => {
    const input = {
      productId: "polar_tension_shade",
      widthInches: 48,
      heightInches: 72,
    };
    expect(priceDesign(input)).toMatchObject({ ok: false, code: "MANUAL_PRICE_REQUIRED" });
    expect(priceDealerNetDesign(input)).toMatchObject({ ok: false, code: "MANUAL_PRICE_REQUIRED" });
  });

  it("prices a verified interior grid coordinate with the 0.45 dealer factor", () => {
    expect(priceDesign({
      productId: "polar_interior_roller",
      programId: "group_1",
      widthInches: 24,
      heightInches: 36,
    })).toMatchObject({
      ok: true,
      base: 110,
      wholesaleUnitPrice: 49.5,
    });
  });
});
