import { selectionContextFromExactInterface } from "@/lib/quote-v2/exact-interface-adapter";
import { describe, expect, it } from "vitest";
import { prepareNormanLegacyPricing, type NormanQuotePricingState } from "./sales-quote-norman-price";
import { getMtsProductColorRows } from "@mts/lib/productColorCatalog";
import { getProductPriceBreakdown } from "@mts/lib/pricingEngine";
import { resolveShutterFramePricing } from "@/lib/quote/shutter-frame-pricing";
import { onyxInsideMountPricingSize } from "@/lib/quote-v2/onyx-pricing-size";

function honeycomb(width = 55, height = 39, quantity = 1): NormanQuotePricingState {
  return {
    quote: { id: "quote", status: "draft", quote_v2_backend: false },
    lines: [{ id: "line", quote_id: "quote", selected_design_id: "design", product_type: "Honeycomb Shades", width_whole: width, width_fraction: "0", height_whole: height, height_fraction: "0", quantity }],
    designs: [{ id: "design", line_item_id: "line", variant: "A", supplier: "Norman", product_type: "Honeycomb Shades", unit_price: 0, shade_type: "Single", mount_type: "Inside Mount", lift_system: "SmartRise Cordless", fabric: "C4008T - Brilliant White RD | Room Darkening", options_json: {
      cell_size: '3/4" Single Cell', fabric_color_collection: "", fabric_color_code: "C4008T", fabric_color_type: "Room Darkening", fabric_color_name: "Brilliant White RD", fabric_program_id: "honeycomb_3_8in_cordless_single_and_3_4in_single", catalog_product_id: "honeycomb", norman_grid_pricing: true, poles: "None", rail_color: "Default", light_control: "Room Darkening", surcharges: [],
    } }],
  } as unknown as NormanQuotePricingState;
}

describe("saved legacy quote selections reaching current pricing", () => {
  it.each([[55,39,1],[22,46,2]])("prices and reopens Honeycomb %s x %s quantity %s", (w,h,q) => {
    const state = honeycomb(w,h,q), before = structuredClone(state);
    const [priced] = prepareNormanLegacyPricing(state, "2026-09-25");
    expect(priced.priceStatus, JSON.stringify(priced.rpcResult)).toBe("authoritative");
    expect(priced.rpcResult.selection).toMatchObject({ configuration: { fabric_collection: "Room Darkening", application: "Standard" } });
    expect(state).toEqual(before);
    expect(prepareNormanLegacyPricing(JSON.parse(JSON.stringify(state)), "2026-09-25")).toEqual([priced]);
  });
  it.each(["SmartRise Cordless", "Cordless TDBU", "Cord Loop", "SmartRelease", "Motorized"])("normalizes the legacy Single application for %s", lift => {
    const state = honeycomb(); state.designs[0].lift_system = lift;
    const selection = () => selectionContextFromExactInterface(state.lines[0], state.designs[0], {productId:"honeycomb",programId:"honeycomb_3_8in_cordless_single_and_3_4in_single",catalogAsOf:"2026-09-25"});
    expect(selection().configuration.application).toBe("Standard");
    state.designs[0].options_json.honeycomb_application = "Side-by-Side";
    expect(selection().configuration.application).toBe("Side-by-Side");
  });
  it.each(["unknown-code", "wrong-family", "specialty-application"])("does not repair ambiguous or invalid %s", kind => {
    const state = honeycomb();
    if(kind === "unknown-code") state.designs[0].options_json.fabric_color_code = "NOT-A-COLOR";
    if(kind === "wrong-family") state.designs[0].options_json.fabric_color_collection = "Light Filtering";
    if(kind === "specialty-application") { state.designs[0].shade_type = null; state.designs[0].lift_system = "SmartFit for Sloped Windows"; }
    expect(prepareNormanLegacyPricing(state,"2026-09-25")[0].priceStatus).toBe("blocked");
  });
  it("writes the exact Honeycomb family from the legacy picker", () => {
    const color = getMtsProductColorRows("Honeycomb Shades", {cell_size:'3/4" Single Cell',lift_system:"SmartRise Cordless"}).find(row => row.colorCode === "C4008T");
    expect(color).toMatchObject({collection:"Room Darkening",fabricType:"Room Darkening"});
  });
  it.each([[55,39,465],[22,46,248]])("prices Onyx VL Inside %s x %s with the eight-foot minimum", (width,height,price) => {
    expect(getProductPriceBreakdown({productType:"Shutters",supplier:"Onyx",program:"Poly Composite",width,height,frameType:"VL Inside",frameSides:4,mountType:"IM",measurementBasis:"W - Window Size"})).toMatchObject({price,pricingWidth:width,pricingHeight:height});
  });
  it.each(["L Inside","L Inside FS","L Bullnose Inside","L Bullnose Inside FS","VL Inside","VL Inside FS"])("keeps both pricing paths consistent for %s", frameType => {
    for (const frameSides of [3,4] as const) {
      const legacy = resolveShutterFramePricing({manufacturer:"Onyx",widthInches:55,heightInches:39,measurementBasis:"window_size",mountType:"inside",frameType,frameSides});
      const v2 = onyxInsideMountPricingSize(55,39,frameType,frameSides);
      for (const result of [legacy,v2]) expect(result).toMatchObject({supported:true,widthAdditionInches:0,heightAdditionInches:0,pricingWidthInches:55,pricingHeightInches:39});
    }
  });
  it("keeps unknown frames and mismatched mounts blocked", () => {
    for (const [frameType,mountType] of [["Invented Frame","inside"],["VL Inside","outside"]] as const)
      expect(resolveShutterFramePricing({manufacturer:"Onyx",widthInches:55,heightInches:39,measurementBasis:"window_size",mountType,frameType,frameSides:4}).supported).toBe(false);
  });
});
