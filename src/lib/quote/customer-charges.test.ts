import { describe, expect, it } from "vitest";
import { calculateCustomerCharges, parseCustomerCharges, storedCustomerCharges } from "./customer-charges";
import { calculateQuoteTotalBreakdown, calculateQuoteFixedCharges, calculateQuoteDesignSubtotal, DEFAULT_QUOTE_ADMIN_CONTROLS } from "@mts/lib/quoteTotals";
import { QUOTE_V2_SELECTED_DESIGN_MARKER } from "@/lib/quote-v2/selected-design";
import { priceQuoteV2Selection, createImmutablePriceSnapshot, toCustomerQuotePriceResult } from "@/lib/quote-v2/engine";
import { QUOTE_V2_CATALOG_VERSION } from "@/lib/quote-v2/catalog";
import { projectV2CustomerRetailPrice } from "@/lib/crm/sales-quote-v2-send";
import { getProduct } from "@/lib/quote/catalog";
import { customModeCustomerRetail } from "@/lib/quote-v2/custom-mode";

describe("customer installation and shipping", () => {
  it("retains the full $117 for three shades after quote discount and existing tax", () => {
    const charges = calculateCustomerCharges({product: "roller", physicalUnitsPerWindow: 1, quantity: 3})!;
    expect(charges).toMatchObject({eligibleUnitCount:3,installationTotal:75,shippingTotal:42,total:117});
    const controls = {...DEFAULT_QUOTE_ADMIN_CONTROLS, showDiscount:true,discountPercent:10};
    expect(calculateQuoteTotalBreakdown(417, controls, charges.total)).toMatchObject({discountAmount:30,total:387});
    expect(calculateQuoteTotalBreakdown(417, {...controls,showTax:true,taxPercent:10},117).total).toBe(425.7);
  });
  it("counts each component and quantity, choosing only the selected alternative", () => {
    const charges = calculateCustomerCharges({product:"lotus_faux_wood_blinds",program:"lotus_ftx",physicalUnitsPerWindow:3,quantity:2})!;
    const lines=[{id:"one",quantity:2}];
    const designs=[{line_item_id:"one",variant:"A",unit_price:200,options_json:{customer_charges:charges}},
      {line_item_id:"one",variant:"B",unit_price:417,[QUOTE_V2_SELECTED_DESIGN_MARKER]:true,options_json:{customer_charges:charges}}];
    expect(calculateQuoteFixedCharges(lines,designs,{mode:"authoritative_v2"})).toBe(234);
    expect(calculateQuoteDesignSubtotal(lines,designs,{mode:"authoritative_v2"})).toBe(834);
  });
  it.each([['norman_shutters','woodlore'],['onyx_shutters','bassia'],['lotus_vertical_blinds','headrail_only'],['lotus_vertical_blinds','vane_case'],['remote','remote'],['polar_awning','standard']])("excludes %s %s",(product,program)=>{
    expect(calculateCustomerCharges({product,program,physicalUnitsPerWindow:1,quantity:3})).toBeNull();
  });
  it.each(["sundance_advantage_ii_2", "sundance_basicvue", "sundance_walden_premier", "sundance_exterior_zip"])("classifies %s using its exact catalog family", (id) => {
    const product = getProduct(id);
    expect(product).toBeDefined();
    expect(calculateCustomerCharges({ product: `${id} ${product!.productType}`, physicalUnitsPerWindow: 1, quantity: 2 })?.total).toBe(78);
  });
  it("preserves historical and manual prices and rejects corrupt fee snapshots",()=>{
    const charges=calculateCustomerCharges({product:"shade",physicalUnitsPerWindow:1,quantity:1})!;
    expect(storedCustomerCharges({})).toBeNull();
    expect(storedCustomerCharges({manual_price_override:true,customer_charges:charges})).toBeNull();
    expect(parseCustomerCharges({...charges,total:0})).toBeNull();
    expect(customModeCustomerRetail({customerCharges:charges,quantity:1},100)).not.toHaveProperty("customerCharges");
  });
  it("keeps costs unchanged and persists customer fees through immutable projection",()=>{
    const selection={manufacturerId:"lotus",productId:"lotus_mini_blinds",programId:"lotus_amx_1in_aluminum_custom",catalogVersion:QUOTE_V2_CATALOG_VERSION,catalogAsOf:"2026-07-20" as const,widthInches:30,heightInches:48,quantity:3,configuration:{},options:{discount_percent:10}};
    const request={selection,priceInput:{productId:selection.productId,programId:selection.programId,widthInches:30,heightInches:48,quantity:3,discountPercent:10},includeInternalCost:true};
    const original=priceQuoteV2Selection(request);
    const charged=priceQuoteV2Selection({...request,applyCustomerCharges:true});
    expect(original.ok).toBe(true);expect(charged.ok).toBe(true);
    if(!original.ok || !charged.ok) throw Error("fixture pricing failed");
    expect(charged.unitPrice).toBeCloseTo(original.unitPrice+39);
    expect(charged.total).toBeCloseTo(original.total+117);
    expect(charged.internalCost).toEqual(original.internalCost);
    expect(charged.discountAmount).toBe(original.discountAmount);
    const saved=JSON.parse(JSON.stringify(createImmutablePriceSnapshot(charged)));
    expect(projectV2CustomerRetailPrice(saved.retail).customerCharges?.total).toBe(117);
    expect(toCustomerQuotePriceResult(charged)).not.toHaveProperty("internalCost");
  });
});
