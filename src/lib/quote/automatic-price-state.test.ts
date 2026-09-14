import { describe, expect, it } from "vitest";
import {
  automaticPriceNeedsClearing,
  automaticPricingInputSignature,
  automaticPricingTrigger,
  clearDerivedAutomaticPrice,
} from "./automatic-price-state";

const signatureInput = {
  productType: "Roman Shades",
  widthWhole: 30,
  widthFraction: "0",
  heightWhole: 60,
  heightFraction: "0",
  quantity: 1,
  variant: "A",
  supplier: "Norman",
  selections: { fabric: "Alba White", liftSystem: "Cordless" },
  options: { fabric_group: "Alba", pricing_grid_price: 100, base_price: 100 },
};

describe("legacy automatic price state", () => {
  it("does not treat calculated metadata changes as configuration edits", () => {
    const first = automaticPricingInputSignature(signatureInput);
    const second = automaticPricingInputSignature({
      ...signatureInput,
      options: {
        base_price: 999,
        pricing_grid_price: 999,
        fabric_group: "Alba",
      },
    });
    expect(second).toBe(first);
  });

  it("does not reprice a persisted quote merely because it was opened", () => {
    const signature = automaticPricingInputSignature(signatureInput);
    expect(automaticPricingTrigger(undefined, signature, 100, { base_price: 100 })).toBeNull();
    expect(automaticPricingTrigger(signature, signature, 100, { base_price: 100 })).toBeNull();
    expect(automaticPricingTrigger(undefined, signature, 0, {})).toBe("new_unpriced");
    expect(automaticPricingTrigger("older signature", signature, 100, { base_price: 100 })).toBe(
      "input_changed",
    );
  });

  it("detects dimension, quantity, and manufacturer-option edits", () => {
    const first = automaticPricingInputSignature(signatureInput);
    expect(
      automaticPricingInputSignature({ ...signatureInput, widthFraction: "1/16" }),
    ).not.toBe(first);
    expect(
      automaticPricingInputSignature({ ...signatureInput, quantity: 2 }),
    ).not.toBe(first);
    expect(
      automaticPricingInputSignature({
        ...signatureInput,
        options: { ...signatureInput.options, frame_type: "Z Trim" },
      }),
    ).not.toBe(first);
  });

  it("removes every stale derived amount while retaining configuration", () => {
    const options = clearDerivedAutomaticPrice(
      {
        fabric_group: "Unknown",
        base_price: 120,
        surcharge_total: 20,
        pricing_grid_key: "group1",
        pricing_grid_price: 120,
        pricing_grid_width: 36,
        pricing_grid_height: 60,
        discount_source_price: 140,
        discount_amount: 14,
      },
      "none",
      "unknown_fabric_price_group",
    );
    expect(options).toEqual({
      fabric_group: "Unknown",
      base_price: 0,
      surcharge_total: 0,
      pricing_method: "none",
      pricing_block_reason: "unknown_fabric_price_group",
    });
    expect(
      automaticPriceNeedsClearing(0, options, "none", "unknown_fabric_price_group"),
    ).toBe(false);
  });
});
