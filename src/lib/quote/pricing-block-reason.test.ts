import { expect, it } from "vitest";
import { pricingBlockReasonMessage } from "./pricing-block-reason";

it("preserves the exact unavailable-cell explanation and explains routing conflicts", () => {
  const reason = 'No price exists for 95" × 108" in this program.';
  expect(pricingBlockReasonMessage(reason)).toBe(reason);
  expect(pricingBlockReasonMessage("manufacturer_product_mismatch")).toContain("different manufacturer");
  expect(pricingBlockReasonMessage("incomplete_lotus_configuration")).toContain("Lotus");
  expect(pricingBlockReasonMessage("manufacturer_restriction:roller_max")).toContain("size requirements");
});
