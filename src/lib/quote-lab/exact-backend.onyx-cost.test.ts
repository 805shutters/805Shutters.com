import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import {
  costExactQuoteBuilderDesign,
  priceExactQuoteBuilderDesign,
} from "./exact-backend";

function onyxLine(quantity = 1): SalesQuoteLineItem {
  return {
    id: "onyx-cost-line",
    quote_id: "quote-onyx-cost",
    room_name: "Living Room",
    product_type: "Shutters",
    width_whole: 30,
    width_fraction: "0",
    height_whole: 60,
    height_fraction: "0",
    quantity,
    sort_order: 0,
    created_at: "2026-07-22T00:00:00.000Z",
  };
}

function onyxDesign(
  programId: string,
  overrides: Partial<SalesQuoteDesign> = {},
): SalesQuoteDesign {
  return {
    id: "onyx-cost-design",
    line_item_id: "onyx-cost-line",
    variant: "A",
    product_type: "Shutters",
    supplier: "Onyx",
    material: "Basswood",
    tilt_type: "Hidden Tilt",
    unit_price: 0,
    options_json: {
      quote_lab_product_id: "onyx_shutters",
      quote_lab_program_id: programId,
    },
    ...overrides,
  } as SalesQuoteDesign;
}

describe("exact-interface Onyx dealer cost", () => {
  it("carries the H3 ledger into wholesale cost and totals quantity exactly", () => {
    const quoteLine = onyxLine(2);
    const design = onyxDesign("painted_basswood");

    expect(priceExactQuoteBuilderDesign(quoteLine, design)).toMatchObject({
      ok: false,
      code: "CUSTOMER_RETAIL_UNDEFINED",
    });
    expect(costExactQuoteBuilderDesign(quoteLine, design)).toMatchObject({
      ok: true,
      basis: "dealer_net",
      productId: "onyx_shutters",
      programId: "painted_basswood",
      wholesaleBase: 168.75,
      wholesaleAddOns: [
        {
          id: "hidden_tilt_rod",
          label: "H3 Hidden Gear",
          amount: 12.5,
        },
      ],
      wholesaleUnitCost: 181.25,
      quantity: 2,
      wholesaleTotal: 362.5,
    });
  });

  it("does not return a cost for quarantined Poly Composite", () => {
    expect(
      costExactQuoteBuilderDesign(
        onyxLine(),
        onyxDesign("poly_composite", { tilt_type: undefined }),
      ),
    ).toMatchObject({ ok: false, code: "MANUAL_PRICE_REQUIRED" });
  });
});
