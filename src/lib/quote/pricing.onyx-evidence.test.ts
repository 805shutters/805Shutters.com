import { describe, expect, it } from "vitest";
import { findProductSurcharge, getProduct, getProgram } from "./catalog";
import { priceDealerNetDesign, priceDesign } from "./pricing";

const ONYX_SOURCE_ID = "onyx-price-screenshot-2026-07-20";
const ONYX_POLY_SOURCE_ID =
  "onyx-owner-confirmed-poly-composite-2026-07-27";

function onyxProgram(programId: string) {
  const product = getProduct("onyx_shutters");
  if (!product) throw new Error("Onyx catalog product is missing.");
  const program = getProgram(product, programId);
  if (!program) throw new Error(`Onyx program ${programId} is missing.`);
  return { product, program };
}

describe("Onyx independent retail and dealer-cost evidence", () => {
  it("stores the seven owner-confirmed retail rates separately from dealer cost", () => {
    const expected = [
      ["painted_basswood", "Basswood", 35, 13.5],
      ["stained_basswood", "Basswood Stain", 38, 16.5],
      ["secamore", "Sycamore", 31, 11.95],
      ["vlo_hybrid", "MDF Hybrid", 29, 10.35],
      ["vinyl", "Vinyl", 31, 11],
      ["onyx_us_made_vinyl", "Onyx U.S. Made Vinyl", 32, 13.6],
      ["poly_composite", "Poly Composite", 31, 12],
    ] as const;

    const product = getProduct("onyx_shutters");
    expect(product).toMatchObject({
      priceBasis: "suggested_retail",
      customerRetailStatus: "verified",
      freightStatus: "unresolved",
    });

    for (const [programId, name, pricePerSqft, costPerSqft] of expected) {
      const { program } = onyxProgram(programId);
      expect(program).toMatchObject({
        name,
        priceAxis: "sqft",
        pricePerSqft,
        costPerSqft,
        minSqft: 8,
      });
      expect(program.sourceId).toBe(
        programId === "poly_composite"
          ? ONYX_POLY_SOURCE_ID
          : ONYX_SOURCE_ID,
      );
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

  it("uses the owner-confirmed $32 USA Poly retail rate", () => {
    expect(
      priceDesign({
        productId: "onyx_shutters",
        programId: "onyx_us_made_vinyl",
        widthInches: 36,
        heightInches: 48,
      }),
    ).toMatchObject({
      ok: true,
      sqft: 12,
      billableSqft: 12,
      base: 384,
      total: 384,
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

  it("prices Poly Composite retail and owner-confirmed wholesale independently", () => {
    const { program } = onyxProgram("poly_composite");
    expect(program).toMatchObject({
      pricePerSqft: 31,
      costPerSqft: 12,
      sourceId: ONYX_POLY_SOURCE_ID,
    });
    expect(
      priceDesign({
        productId: "onyx_shutters",
        programId: "poly_composite",
        widthInches: 30,
        heightInches: 60,
      }),
    ).toMatchObject({ ok: true, billableSqft: 13, base: 403, total: 403 });
    expect(
      priceDealerNetDesign({
        productId: "onyx_shutters",
        programId: "poly_composite",
        widthInches: 30,
        heightInches: 60,
      }),
    ).toMatchObject({
      ok: true,
      billableSqft: 13,
      dealerNetBaseCost: 156,
      dealerNetUnitCost: 156,
      dealerNetTotalCost: 156,
    });
  });
});
