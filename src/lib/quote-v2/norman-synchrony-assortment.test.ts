import { getMtsProductColorRows } from "@mts/lib/productColorCatalog";
import { repriceExactQuoteBuilderForServerDate } from "@/lib/quote-lab/exact-backend";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { validateSelection } from "./rules";
import { authoritativeAutomaticSurchargeSelections } from "./engine";
import { quoteV2CatalogVersionFor } from "./catalog";
import type { SelectionContext } from "./core";
import { SYNCHRONY_DEALER_COLOR_CODES, synchronyDefaultHardware } from "@/lib/quote/norman-synchrony";
import { describe, expect, it } from "vitest";
import { getProductColorOptions } from "@/lib/quote/product-color-options";
import { getProduct, getProgram } from "@/lib/quote/catalog";
import { getVerticalColorsForGroup } from "@mts/lib/quoteConstants";
import { synchronyVerticalActiveColors, synchronyVerticalDiscontinuedColors } from "./catalog";

describe("Synchrony complete June dealer assortment", () => {
  it("accounts for all 46 orderable collection/color identities in the picker and correct grid", () => {
    const colors = getProductColorOptions("synchrony_vertical");
    expect(colors.filter(c => c.available)).toHaveLength(46);
    for (const offering of synchronyVerticalActiveColors) {
      const matches = colors.filter(c => c.collection === offering.collection && c.colorName === offering.colorName && c.available);
      expect(matches, `${offering.collection}: ${offering.colorName}`).toHaveLength(1);
      const group = offering.priceGroup!.slice(-1);
      expect(matches[0].colorCode).toBe(SYNCHRONY_DEALER_COLOR_CODES[offering.collection][offering.colorName]);
      expect(matches[0].programId).toBe(`synchrony_vertical_synchrony_vertical_blind_price_group_${group}_pg${group}`);
      expect(getProgram(getProduct("synchrony_vertical")!, matches[0].programId!)?.grid.prices.length).toBeGreaterThan(0);
      expect(getVerticalColorsForGroup(offering.collection)).toContain(`${offering.colorName} Collection: ${offering.collection}`);
    }
  });
  it("retains all four withdrawn colors without offering them on new quotes", () => {
    const colors = getProductColorOptions("synchrony_vertical");
    expect(colors.filter(c => !c.available)).toHaveLength(4);
    for (const offering of synchronyVerticalDiscontinuedColors) {
      const match = colors.find(c => c.collection === offering.collection && c.colorName === offering.colorName);
      expect(match).toMatchObject({ available: false });
      expect(getVerticalColorsForGroup(offering.collection)).not.toContain(`${offering.colorName} Collection: ${offering.collection}`);
    }
  });
});

function current(width = 36, patch: SelectionContext["configuration"] = {}): SelectionContext {
 return { manufacturerId: "Norman", productId: "synchrony_vertical", programId: "synchrony_vertical_synchrony_vertical_blind_price_group_1_pg1", catalogAsOf: "2026-09-19", catalogVersion: quoteV2CatalogVersionFor("synchrony_vertical", "2026-09-19"), widthInches: width, heightInches: 60, quantity: 1, options: {}, configuration: { mount_type: "Outside Mount", fabric_collection: "Classic", fabric_color_name: "Pure White", stack_option: "Stack Left", draw_direction: "Left Draw", control_type: "Cordless Wand Operation", ...patch } };
}
describe("Synchrony hardware and accessory conditions", () => {
 it.each([[48,2],[48.0625,3],[78,3],[78.0625,4],[100,4]])("derives shim charges at width %s", (width, brackets) => {
   for (const layers of [0,1,2]) {
     const selected = authoritativeAutomaticSurchargeSelections(current(width,{vertical_shim_layers:layers,shim_quantity:99,shim:true}));
     expect(selected).toEqual(layers ? [{id:"shim",units:brackets*layers}] : []);
   }
 });
 it("rejects invalid controls, stack mismatches and inside-mount shims on the server", () => {
   for (const [patch, rule] of [
     [{stack_option:"Split"},"stack_draw"], [{draw_direction:"Right Draw"},"stack_draw"],
     [{motor_type:"Motorized"},"control.invalid"], [{lift_system:"Continuous Cord Loop"},"control.invalid"], [{vertical_wand_drop_inches:48},"wand_drop.invalid"],
     [{vertical_shim_layers:3},"shim_layers"], [{vertical_hardware_color:"Black"},"hardware_color"],
     [{mount_type:"Inside Mount",mount_depth_inches:4,vertical_shim_layers:1},"shims.outside_mount_only"],
   ] as const) expect(validateSelection(current(36,patch)).map(i=>i.ruleId)).toContain(`vertical.${rule}`);
 });
 it("retains valid wand overrides and default versus explicit hardware", () => {
   for (const drop of [34,49,61]) expect(validateSelection(current(36,{vertical_wand_drop_inches:drop})).find(i=>i.ruleId==="vertical.wand_drop")?.derivedValues).toEqual({wandDropInches:drop});
   expect(validateSelection(current()).find(i=>i.ruleId==="vertical.hardware_color")?.derivedValues).toEqual({hardwareColor:"White"});
   expect(validateSelection(current(36,{vertical_hardware_color:"Nature"})).find(i=>i.ruleId==="vertical.hardware_color")?.derivedValues).toEqual({hardwareColor:"Nature"});
   expect(synchronyDefaultHardware("Chic Gray")).toBe("Nature");
   expect(synchronyDefaultHardware("Burnished Clay")).toBe("White");
 });
});

it.each(getMtsProductColorRows("Vertical Blinds", {quote_v2_backend:true}))("server-prices and reopens $collection / $colorName with derived shims", (color) => {
 const retail = [261,319,354,423][Number(color.programId!.slice(-1))-1];
 const design = {id:"d",line_item_id:"l",variant:"A",supplier:"Norman",mount_type:"Outside Mount",product_type:"Vertical Blinds",options_json:{quote_v2_backend:true,catalog_product_id:"synchrony_vertical",quote_lab_product_id:"synchrony_vertical",catalog_program_id:"synchrony_vertical_synchrony_vertical_blind_price_group_1_pg1",quote_lab_program_id:"synchrony_vertical_synchrony_vertical_blind_price_group_1_pg1",fabric_program_id:color.programId,fabric_color_id:color.id,fabric_color_code:color.colorCode,fabric_color_name:color.colorName,fabric_color_collection:color.collection,fabric_group:color.collection,vertical_color:color.colorName,stack_option:"Stack Left",draw_direction:"Left Draw",control_type:"Cordless Wand Operation",vertical_shim_layers:2,vertical_hardware_color:"Nature",vertical_wand_drop_inches:49,shim_quantity:99}} as unknown as SalesQuoteDesign;
 const input = {lines:[{id:"l",quote_id:"audit",room_name:"Office",product_type:"Vertical Blinds",width_whole:36,width_fraction:"0",height_whole:60,height_fraction:"0",quantity:1,sort_order:0} as SalesQuoteLineItem],designs:[design],selectedVariantByLine:{l:"A"}};
 const result = repriceExactQuoteBuilderForServerDate(input,"2026-09-19");
 if (!("backend" in result) || result.backend!=="v2") throw new Error("Expected V2");
 expect(result.designs[0].result).toMatchObject({ok:true,base:retail});
 expect(result.designs[0].selection.configuration).toMatchObject({fabric_color_code:color.colorCode,vertical_shim_layers:2,vertical_hardware_color:"Nature",vertical_wand_drop_inches:49});
 expect(result.designs[0].snapshot).not.toBeNull();
 const priced = result.designs[0].result;
 if (!priced.ok) throw new Error("Expected valid Synchrony pricing");
 expect(priced.components).toEqual(expect.arrayContaining([
   expect.objectContaining({category:"base_grid",catalogAmount:261,source:expect.objectContaining({sourceId:"norman-retail-guide-2026-09"})}),
   expect.objectContaining({category:"fabric_upgrade",catalogAmount:retail-261}),
   expect.objectContaining({priceLineId:"shim",catalogAmount:28,units:4,source:expect.objectContaining({sourceId:"norman-retail-guide-2026-09"})}),
 ]));
 expect(repriceExactQuoteBuilderForServerDate(JSON.parse(JSON.stringify(input)),"2026-09-19")).toEqual(result);
});
