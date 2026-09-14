import { expect, it } from "vitest";
import { getProductPriceBreakdown as current } from "@mts/lib/pricingEngine";
import { getProductPriceBreakdown as frozen } from "@mts-v1/lib/pricingEngine";
import { repriceExactQuoteBuilderForServerDate } from "@/lib/quote-lab/exact-backend";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
for(const [label, price] of [["current",current],["v1",frozen]] as const){
 it(`${label}: Polar uses its own grid and rejects stale manufacturer identities`,()=>{
  expect(price({productType:"Roller Shades",supplier:"Polar",catalogProductId:"polar_interior_roller",catalogProgramId:"group_2",fabric:"SunTex 80 25%",width:24,height:36})).toMatchObject({price:113,matchedWidth:24,matchedHeight:36});
  expect(price({productType:"Roller Shades",supplier:"Polar",catalogProductId:"roller",width:24,height:36})).toMatchObject({price:null,blockReason:"manufacturer_product_mismatch"});
  expect(price({productType:"Roller Shades",supplier:"Polar",width:24,height:36}).price).toBeNull();
  expect(price({productType:"Roller Shades",supplier:"Sundance",width:24,height:36}).price).toBeNull();
 });
}
it("V2 refuses a stale Norman product after switching the manufacturer",()=>{
 const line={id:"line",product_type:"Roller Shades",width_whole:30,width_fraction:"0",height_whole:48,height_fraction:"0",quantity:1} as SalesQuoteLineItem;
 const design={id:"design",line_item_id:"line",variant:"A",supplier:"Polar",options_json:{quote_v2_backend:true,catalog_product_id:"roller"}} as unknown as SalesQuoteDesign;
 expect(()=>repriceExactQuoteBuilderForServerDate({lines:[line],designs:[design],selectedVariantByLine:{line:"A"}},"2026-09-14")).toThrow("Selected manufacturer Polar does not match");
});
