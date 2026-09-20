import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SundanceDesignOptions } from "@/components/crm/SundanceDesignOptions";
import { sundanceCellularFilterPatch, sundanceCellularSelectionPatch } from "./configuration";
import { sundanceDraperyTrackFields, SUNDANCE_DRAPERY_TRACK_ID } from "./drapery-track";
import { buildUiCatalog } from "../ui-catalog";
import { quoteLabProductType } from "@/lib/quote-lab/builder";
import { priceDesign } from "../pricing";
import type { SalesQuoteDesign } from "@mts/types/quote";

describe("Sundance saved manual configuration", () => {
  it("selects exact fabric identity and clears it when an incompatible filter is changed", () => {
    const options = {cell_size:'3/4"',light_control:'Blackout',catalog_product_id:'sundance_cellular',unrelated_note:'retain me'};
    const selected = sundanceCellularSelectionPatch(options, "sundance_cellular:PU422SS-766")!;
    expect(selected).toMatchObject({fabric_color_code:'PU422SS-766',fabric_program_id:'sundance_cellular_p10_t1',catalog_program_id:'sundance_cellular_p10_t1'});
    expect(sundanceCellularSelectionPatch(options,"sundance_cellular:PS41RA-023")).toBeNull();
    const changed = sundanceCellularFilterPatch(JSON.parse(JSON.stringify(selected)),"cell_size",'9/16"');
    expect(changed).toMatchObject({cell_size:'9/16"',fabric_color_id:null,fabric_color_code:null,fabric_program_id:null,catalog_program_id:null,unrelated_note:'retain me'});
    expect(sundanceCellularSelectionPatch(changed,"sundance_cellular:PU422SS-766")).toBeNull();
  });
  it("renders filtered cellular choices in the dedicated manual panel", () => {
    const markup=renderToStaticMarkup(createElement(SundanceDesignOptions,{productId:'sundance_cellular',design:{options_json:{cell_size:'3/4"',light_control:'Blackout'}} as SalesQuoteDesign,onUpdateFields:()=>{}}));
    expect(markup).toContain('PU422SS-766');
    expect(markup).not.toContain('PS41RA-023');
    expect(markup).toContain('dealer-confirmed manual price');
  });
  it("exposes Glydea with its own seven dealer menus and no inferred price or program", () => {
    const product=buildUiCatalog().products.find(p=>p.id===SUNDANCE_DRAPERY_TRACK_ID)!;
    expect(product).toMatchObject({manufacturer:'Sundance',priceBasis:'manual_required',programs:[],motorizationGroups:[]});
    expect(product.details).toHaveLength(7);
    expect(quoteLabProductType(product.id)).toBe('Drapery Tracks');
    expect(sundanceDraperyTrackFields.map(f=>f.options?.length)).toEqual([5,2,2,2,3,2,4]);
    const markup=renderToStaticMarkup(createElement(SundanceDesignOptions,{productId:product.id,design:undefined,onUpdateFields:()=>{}}));
    for(const field of product.details) expect(markup).toContain(`Sundance ${field.label}`);
    expect(priceDesign({productId:product.id,widthInches:120,heightInches:96})).toMatchObject({ok:false,code:'MANUAL_PRICE_REQUIRED'});
  });
});
