import { describe, expect, it } from "vitest";
import {
  buildCopiedLineItemPatch,
  getMatchingCopyTargetIds,
  lineItemsHaveMatchingProductType,
} from "./quoteDesignCopy";
import type { SalesQuoteLineItem } from "@mts/types/quote";

function lineItem(overrides: Partial<SalesQuoteLineItem>): SalesQuoteLineItem {
  return {
    id: overrides.id ?? "line-1",
    quote_id: "quote-1",
    room_name: overrides.room_name ?? "Living Room",
    product_type: overrides.product_type ?? "Roller Shades",
    width_whole: overrides.width_whole ?? 30,
    width_fraction: overrides.width_fraction ?? "0",
    height_whole: overrides.height_whole ?? 60,
    height_fraction: overrides.height_fraction ?? "0",
    quantity: overrides.quantity ?? 1,
    sort_order: overrides.sort_order ?? 0,
    created_at: "",
  };
}

describe("quote design copy target matching", () => {
  it("matches product types case-insensitively after trimming", () => {
    expect(
      lineItemsHaveMatchingProductType(
        lineItem({ product_type: " Roller Shades " }),
        lineItem({ product_type: "roller shades" })
      )
    ).toBe(true);
  });

  it("copy all targets only matching product line items", () => {
    const source = lineItem({ id: "roller-source", product_type: "Roller Shades" });
    const rollerTarget = lineItem({ id: "roller-target", product_type: "Roller Shades" });
    const shutterTarget = lineItem({ id: "shutter-target", product_type: "Shutters" });

    expect(getMatchingCopyTargetIds(source, [source, rollerTarget, shutterTarget])).toEqual([
      "roller-target",
    ]);
  });

  it("copy some ignores selected targets that do not match the source product", () => {
    const source = lineItem({ id: "shutter-source", product_type: "Shutters" });
    const shutterTarget = lineItem({ id: "shutter-target", product_type: "Shutters" });
    const rollerTarget = lineItem({ id: "roller-target", product_type: "Roller Shades" });

    expect(
      getMatchingCopyTargetIds(source, [source, shutterTarget, rollerTarget], [
        "roller-target",
        "shutter-target",
      ])
    ).toEqual(["shutter-target"]);
  });

  it("does not include size or room fields in the copied line-item patch", () => {
    expect(
      buildCopiedLineItemPatch(
        lineItem({
          room_name: "Kitchen",
          product_type: "Shutters",
          width_whole: 44,
          height_whole: 72,
          quantity: 3,
        })
      )
    ).toEqual({ product_type: "Shutters" });
  });
});
