import { describe, expect, it } from "vitest";
import {
  lotusAllowsPieceOrdering,
  lotusBrokenPackageSurcharge,
  lotusFreightCost,
  lotusSmallOrderSurcharge,
} from "./lotus-order-costs";

describe("Lotus dealer-net order rules (PDF p2)", () => {
  it("adds 25% for a broken MLX carton but not a complete carton", () => {
    expect(lotusBrokenPackageSurcharge({
      programId: "lotus_mlx_1in_vinyl_stock",
      dealerNetUnitCost: 9.77,
      quantity: 5,
      cartonQty: 6,
    })).toBe(12.21);
    expect(lotusBrokenPackageSurcharge({
      programId: "lotus_mlx_1in_vinyl_stock",
      dealerNetUnitCost: 9.77,
      quantity: 6,
      cartonQty: 6,
    })).toBe(0);
  });

  it("allows 2-inch Vinyl Plus and all 2-inch/2.5-inch Faux Wood by the piece", () => {
    expect(lotusAllowsPieceOrdering("lotus_rtx_2in_vinyl_plus_stock")).toBe(true);
    expect(lotusAllowsPieceOrdering("lotus_fgx_2_5in_bright_white_stock")).toBe(true);
    expect(lotusBrokenPackageSurcharge({
      programId: "lotus_rtx_2in_vinyl_plus_stock",
      dealerNetUnitCost: 21.65,
      quantity: 1,
      cartonQty: 2,
    })).toBe(0);
  });

  it("applies the strict small-order and prepaid-freight thresholds", () => {
    expect(lotusSmallOrderSurcharge(49.99)).toBe(5);
    expect(lotusSmallOrderSurcharge(50)).toBe(0);
    expect(lotusFreightCost(2500)).toBeNull();
    expect(lotusFreightCost(2500.01)).toBe(0);
  });
});
