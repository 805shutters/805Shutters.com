import { expect, it } from "vitest";
import { quoteLineProductName } from "./quote-line-evidence";
import { activeDesignEvidence } from "./active-design-evidence";
import { listProducts } from "@/lib/quote/catalog";
import labels from "@/lib/quote/product-labels.json";
it("keeps the compact label map identical to the source catalog", () => {
  expect(labels).toEqual(Object.fromEntries(listProducts().map(product => [product.id, product.name])));
});
it("retains selected and legacy product labels without pricing grids", () => {
  const identity = {id:"selected",product_id:listProducts()[0].id};
  const line = { selected_design_id:"selected", designs:[{...identity,price_breakdown:{source:"mts_805_bookkeeping",productType:"Custom shutters",largeGrid:[1,2,3]}}] };
  const projected = {...line,designs:[activeDesignEvidence({...identity,price_source:"mts_805_bookkeeping",legacy_product_type:"Custom shutters"})]};
  expect(quoteLineProductName(projected,false)).toBe(quoteLineProductName(line,false));
});
