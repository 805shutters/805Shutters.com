import { describe, expect, it } from "vitest";
import {
  automaticPriceNeedsClearing,
  automaticPricingInputSignature,
  automaticPricingSnapshotOptions,
  automaticPricingTrigger,
  clearDerivedAutomaticPrice,
  physicalUnitsPerWindow,
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
        customer_charges: { total: 39 },
      },
      "none",
      "unknown_fabric_price_group",
      {
        inputWidthWhole: 36,
        inputWidthFraction: "0",
        inputHeightWhole: 60,
        inputHeightFraction: "0",
        source: "Norman guide",
        sourceVersion: "norman-2026",
      },
    );
    expect(options).toEqual({
      fabric_group: "Unknown",
      base_price: 0,
      surcharge_total: 0,
      pricing_method: "none",
      pricing_block_reason: "unknown_fabric_price_group",
      pricing_calculation_status: "invalid",
      pricing_input_width_whole: 36,
      pricing_input_width_fraction: "0",
      pricing_input_height_whole: 60,
      pricing_input_height_fraction: "0",
      pricing_source: "Norman guide",
      pricing_source_version: "norman-2026",
    });
    expect(
      automaticPriceNeedsClearing(0, options, "none", "unknown_fabric_price_group"),
    ).toBe(false);
  });

  it("stores raw measurement parts separately from pricing dimensions", () => {
    expect(automaticPricingSnapshotOptions("priced", {
      inputWidthWhole: 35,
      inputWidthFraction: "1/2",
      inputHeightWhole: 60,
      inputHeightFraction: "1/16",
      pricingWidth: 36.5,
      pricingHeight: 61.0625,
      source: "Pinned source",
      sourceVersion: "source-revision",
    })).toEqual({
      pricing_calculation_status: "priced",
      pricing_input_width_whole: 35,
      pricing_input_width_fraction: "1/2",
      pricing_input_height_whole: 60,
      pricing_input_height_fraction: "1/16",
      pricing_dimension_width: 36.5,
      pricing_dimension_height: 61.0625,
      pricing_source: "Pinned source",
      pricing_source_version: "source-revision",
    });
  });

  it("counts physical shades and blinds within one opening", () => {
    expect(physicalUnitsPerWindow("Roller Shades", null, { coupled_shade_count: 3 })).toBe(3);
    expect(physicalUnitsPerWindow("Roller Shades", null, { lightguard_360_shade_count: 2 })).toBe(2);
    expect(physicalUnitsPerWindow("Faux Wood Blinds", null, { faux_blind_count: 3 })).toBe(3);
    expect(physicalUnitsPerWindow("Faux Wood Blinds", null, { lotus_blind_count: 3 })).toBe(3);
    expect(physicalUnitsPerWindow("Honeycomb Shades", "2 on 1", {})).toBe(2);
    expect(physicalUnitsPerWindow("Roman Shades", null, {})).toBe(1);
  });
});
