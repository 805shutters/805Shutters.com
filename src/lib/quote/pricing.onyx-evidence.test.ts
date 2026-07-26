import { describe, expect, it } from "vitest";
import { findProductSurcharge, getProduct, getProgram } from "./catalog";
import { priceDealerNetDesign, priceDesign } from "./pricing";

const ONYX_SOURCE_ID = "onyx-price-screenshot-2026-07-20";

function onyxProgram(programId: string) {
  const product = getProduct("onyx_shutters");
  if (!product) throw new Error("Onyx catalog product is missing.");
  const program = getProgram(product, programId);
  if (!program) throw new Error(`Onyx program ${programId} is missing.`);
  return { product, program };
}

describe("Onyx dealer-cost evidence", () => {
  it("stores the six supplied material rows as dealer cost without inventing MSRP", () => {
    const expected = [
      ["painted_basswood", "Basswood", 13.5],
      ["stained_basswood", "Basswood Stain", 16.5],
      ["secamore", "Sycamore", 11.95],
      ["vlo_hybrid", "MDF Hybrid", 10.35],
      ["vinyl", "Vinyl", 11],
      ["onyx_us_made_vinyl", "Onyx U.S. Made Vinyl", 13.6],
    ] as const;

    const product = getProduct("onyx_shutters");
    expect(product).toMatchObject({
      priceBasis: "dealer_net",
      customerRetailStatus: "unverified",
      freightStatus: "unresolved",
    });

    for (const [programId, name, costPerSqft] of expected) {
      const { program } = onyxProgram(programId);
      expect(program).toMatchObject({
        name,
        priceBasis: "dealer_net",
        sourceId: ONYX_SOURCE_ID,
        priceAxis: "sqft",
        pricePerSqft: null,
        costPerSqft,
        minSqft: 8,
      });
    }
  });

  it("prices dealer cost per square foot and applies the 8-square-foot minimum", () => {
    const exact = priceDealerNetDesign({
      productId: "onyx_shutters",
      programId: "onyx_us_made_vinyl",
      widthInches: 36,
      heightInches: 48,
    });
    expect(exact).toMatchObject({
      ok: true,
      sqft: 12,
      billableSqft: 12,
      dealerNetUnitCost: 163.2,
    });

    const minimum = priceDealerNetDesign({
      productId: "onyx_shutters",
      programId: "onyx_us_made_vinyl",
      widthInches: 24,
      heightInches: 24,
    });
    expect(minimum).toMatchObject({
      ok: true,
      sqft: 4,
      billableSqft: 8,
      dealerNetUnitCost: 108.8,
    });
  });

  it("refuses to present the former $34 policy value as manufacturer retail", () => {
    expect(
      priceDesign({
        productId: "onyx_shutters",
        programId: "onyx_us_made_vinyl",
        widthInches: 36,
        heightInches: 48,
      }),
    ).toMatchObject({
      ok: false,
      code: "CUSTOMER_RETAIL_UNDEFINED",
    });
  });

  it("records H2 as free and H3 Hidden Gear as $1 per square foot dealer cost", () => {
    const { product } = onyxProgram("onyx_us_made_vinyl");
    expect(findProductSurcharge(product, "h2_tilt")).toMatchObject({
      name: "H2 Tilt",
      per: "sqft",
      value: null,
      dealerNetValue: 0,
      sourceId: ONYX_SOURCE_ID,
    });
    expect(findProductSurcharge(product, "hidden_tilt_rod")).toMatchObject({
      name: "H3 Hidden Gear",
      per: "sqft",
      value: null,
      dealerNetValue: 1,
      sourceId: ONYX_SOURCE_ID,
    });
  });

  it("quarantines the legacy Poly Composite value without pinned provenance", () => {
    const { program } = onyxProgram("poly_composite");
    expect(program).toMatchObject({
      priceBasis: "manual_required",
      costPerSqft: null,
    });
    expect(program).not.toHaveProperty("sourceId");
    expect(
      priceDealerNetDesign({
        productId: "onyx_shutters",
        programId: "poly_composite",
        widthInches: 30,
        heightInches: 60,
      }),
    ).toMatchObject({ ok: false, code: "MANUAL_PRICE_REQUIRED" });
  });
});
