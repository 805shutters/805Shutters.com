import { expect, it } from "vitest";
import { calculateCustomerCharges } from "@/lib/quote/customer-charges";
import { computeQuoteMoney, DEFAULT_ADJUSTMENTS, designCustomerCharges, quoteFixedCustomerCharges } from "./quote-money";
import { computeSelectionMoney, describeDesign, expandPublicQuoteLine, projectLine } from "./public-quote";
import { calculateSalesQuoteMirrorPricing } from "./sales-quote-send";
import type { CrmQuoteDesign, CrmQuoteLineItem } from "./types";

const charges = calculateCustomerCharges({product:"roller",physicalUnitsPerWindow:1,quantity:3})!;
const design={id:"design",label:"A",product_id:"roller",program_id:"roller_cordless_fabric_price_group_1_pg1",price_status:"ok",unit_price:139,details:{},surcharges:[],motorization:[],price_breakdown:{customerCharges:charges,onceTotal:0}} as unknown as CrmQuoteDesign;
const line={id:"line",quantity:3,selected_design_id:"design",designs:[design],room:"Living"} as CrmQuoteLineItem;
it("preserves fixed fees in public whole/subset calculations and labels each expanded unit once",()=>{
  expect(quoteFixedCustomerCharges([line])).toBe(117);
  expect(computeQuoteMoney(417,{...DEFAULT_ADJUSTMENTS,discountPercent:10},117).total).toBe(387);
  expect(describeDesign(design).options).toContain("Installation: $25.00 (1 × $25)");
  const expanded=expandPublicQuoteLine(projectLine(line,false));
  expect(expanded).toHaveLength(3);
  expect(expanded.map(row=>row.fixedCharges)).toEqual([39,39,39]);
  expect(computeSelectionMoney(expanded,{...DEFAULT_ADJUSTMENTS,discountPercent:10}).total).toBe(387);
  expect(computeSelectionMoney(expanded.slice(0,1),{...DEFAULT_ADJUSTMENTS,discountPercent:10}).total).toBe(129);
  expect(designCustomerCharges({...design,price_breakdown:{}} as CrmQuoteDesign)).toBeNull();
});
it("keeps the CRM mirror at $387 and excludes unselected alternatives",()=>{
 const q={installer_notes:JSON.stringify({__adminControls:{showDiscount:true,discountPercent:10}})};
 const lines=[{id:"line",quantity:3,selected_design_id:"selected"}];
 const designs=new Map([["line",[{id:"selected",unit_price:139,options_json:{customer_charges:charges}},{id:"other",unit_price:1000,options_json:{}}]]]);
 expect(calculateSalesQuoteMirrorPricing(q,lines,designs).total).toBe(387);
});
