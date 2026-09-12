import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { applyQuoteDesignDiscount, removeQuoteDesignDiscount } from "./quoteDiscounts";
import { calculateQuoteDesignSubtotal, selectedQuoteTotalDesigns } from "./quoteTotals";
import { QUOTE_V2_SELECTED_DESIGN_MARKER } from "@/lib/quote-v2/selected-design";
const design = (price: number, options = {}) => ({ line_item_id: "line", variant: "A", unit_price: price, options_json: options }) as SalesQuoteDesign;
describe("discounts on exact selling prices", () => {
 it("uses the saved price even when the old catalog breakdown disagrees", () => {
  expect(applyQuoteDesignDiscount(design(837, { base_price: 713, surcharge_total: 0 }), 10).unit_price).toBe(753.3);
 });
 it("never compounds repeated or changed discounts", () => {
  const original = design(1445, { manual_price_override: true, base_price: 1103 });
  const discounted = { ...original, ...applyQuoteDesignDiscount(original, 10) };
  expect(applyQuoteDesignDiscount(discounted, 10).unit_price).toBe(1300.5);
  expect(applyQuoteDesignDiscount(discounted, 20).unit_price).toBe(1156);
  expect(removeQuoteDesignDiscount(discounted).unit_price).toBe(1445);
 });
 it("keeps explicit zero prices at zero and ignores abandoned discount metadata", () => {
  expect(applyQuoteDesignDiscount(design(0, {manual_price_override: true, base_price: 100}), 10).unit_price).toBe(0);
  expect(applyQuoteDesignDiscount(design(500, {discount_source_price: 900}), 10).unit_price).toBe(450);
 });
 it("discounts the four selected items to $3,679.20 without billing the old shutter", () => {
  const rows = [1445,1136,837,670].map((price,i) => ({...design(price),line_item_id:String(i),[QUOTE_V2_SELECTED_DESIGN_MARKER]:true}));
  const old = {...design(641.7),line_item_id:'2',variant:'B'};
  const discounted = selectedQuoteTotalDesigns([...rows, old]).map(row => ({...row,...applyQuoteDesignDiscount(row,10)}));
  expect(discounted.map(d=>d.unit_price)).toEqual([1300.5,1022.4,753.3,603]);
  expect(calculateQuoteDesignSubtotal(rows.map(row=>({id:row.line_item_id,quantity:1})),discounted)).toBe(3679.2);
 });
});
