import { getProduct } from '@/lib/quote/catalog';
import type { SalesQuoteDesign } from '@mts/types/quote';

/** September 2026 Norman retail guide, file pp9–35. No fabric/color is inferred. */
export const BASE_CONFIGURATION_VERSION = '805-v2-base-1';
type BaseConfiguration = { programId: string | null; fields: Partial<SalesQuoteDesign>; options: Record<string, unknown> };
export const BASE_CONFIGURATIONS: Readonly<Record<string, BaseConfiguration>> = {
 roller: {programId:'roller_cordless_fabric_price_group_1_pg1',fields:{lift_system:'Cordless',shade_type:'Single Shade',valance:'No Valance'},options:{price_group:'group1',roller_application:'Single Shade',roller_top_treatment:'No Top Treatment',top_treatment_class:'No Top Treatment'}},
 roman: {programId:'roman_cordless_usa_price_group_1_pg1',fields:{lift_system:'Cordless',shade_type:'Single'},options:{price_group:'group1',fold_style:'Flat Fold with Batten Back',lining:'Translucent'}},
 honeycomb: {programId:'honeycomb_3_8in_cordless_single_and_3_4in_single',fields:{lift_system:'Cordless',shade_type:'Single'},options:{cell_size:'3/4" Single Cell',light_control:'Light Filtering',honeycomb_application:'Standard'}},
 perfectsheer: {programId:'perfectsheer_perfectsheer_shades_light_filtering',fields:{lift_system:'Continuous Cord Loop'},options:{light_control:'Light Filtering'}},
 citylights_aluminum: {programId:'citylights_aluminum_1in_slats_cordless_pgusa',fields:{lift_system:'Cordless'},options:{slat_size:'1"',slat_finish:'Standard',light_control:'Regular Route Holes'}},
 smartprivacy_faux: {programId:'smartprivacy_faux_2in_and_2_1_2in_slats_cordless',fields:{lift_system:'Cordless'},options:{product_line:'SmartPrivacy',slat_size:'2"',finish_type:'Smooth',faux_configuration_version:'faux-wood-v2',faux_blind_count:1}},
 faux_wood: {programId:'faux_wood_2in_and_2_1_2in_slats_cordless',fields:{lift_system:'Cordless'},options:{product_line:'Ultimate',slat_size:'2"',finish_type:'Smooth',faux_configuration_version:'faux-wood-v2',faux_blind_count:1}},
 wood_blinds: {programId:'wood_blinds_2in_and_2_1_2in_slats',fields:{lift_system:'Cordless'},options:{product_line:'Ultimate',slat_size:'2"'}},
 synchrony_vertical: {programId:'synchrony_vertical_synchrony_vertical_blind_price_group_1_pg1',fields:{},options:{fabric_group:'Classic collection',price_group:'group1',control_type:'Cordless Wand Operation'}},
 smartdrape: {programId:'smartdrape_smartdrape_light_filtering',fields:{lift_system:'Manual'},options:{light_control:'Light Filtering',control_type:'Manual'}},
 norman_shutters: {programId:null,fields:{tilt_type:'Standard Tilt'},options:{}},
 onyx_shutters: {programId:null,fields:{tilt_type:'Standard Tilt'},options:{}},
};

/** Only called on an intentional new product/program selection, never during loading. */
export function baseConfiguration(productId: string): BaseConfiguration | undefined {
 const base=BASE_CONFIGURATIONS[productId];
 return base ? {programId:base.programId,fields:{...base.fields},options:{...base.options,base_configuration_version:BASE_CONFIGURATION_VERSION}} : undefined;
}

/** Clear the selected swatch and its derived price family without changing paid options. */
export function clearBaseFabricOptions(options:Record<string,unknown>):Record<string,unknown> {
 if(options.base_configuration_version!==BASE_CONFIGURATION_VERSION)return options;
 const id=String(options.catalog_product_id??options.quote_lab_product_id??'');
 const base=baseConfiguration(id);if(!base)return options;
 const result={...options};
 const programId=baseProgramForConfiguration(id,result);
 if(programId){result.catalog_program_id=programId;result.quote_lab_program_id=programId;}
 for(const key of Object.keys(result))if(/^fabric_(?:color_|program_id|product_id|surcharge_id)/.test(key))delete result[key];
 delete result.color;delete result.color_name;delete result.vertical_color;delete result.fabric_collection;delete result.roman_fabric_category;
 if(id==='synchrony_vertical')result.fabric_group='Classic collection';
 if(['roller','roman','synchrony_vertical'].includes(id))result.price_group='group1';
 if(['honeycomb','perfectsheer','smartdrape'].includes(id))result.light_control='Light Filtering';
 if(id==='citylights_aluminum')result.slat_finish='Standard';
 if(['smartprivacy_faux','faux_wood'].includes(id))result.finish_type='Smooth';
 return result;
}

export function baseProgramForConfiguration(productId:string,options:Record<string,unknown>):string|null {
 if(productId==='honeycomb') {
  const cell=String(options.cell_size??'');
  if(cell==='9/16" Single Cell')return 'honeycomb_9_16in_cordless_single_cell';
  if(cell==='1/2" Double Cell')return 'honeycomb_1_2in_cordless_double';
  if(['3/4" Double Cell','1 1/4" Single Cell'].includes(cell))return 'honeycomb_3_4in_cordless_double_and_1_1_4in_single';
  if(['3/8" Single Cell','3/4" Single Cell'].includes(cell))return 'honeycomb_3_8in_cordless_single_and_3_4in_single';
  return null;
 }
 return BASE_CONFIGURATIONS[productId]?.programId??null;
}

/** The selected swatch replaces all persisted base-category labels, as well as grid routing. */
export function resolveBaseFabricProgram(options:Record<string,unknown>,programId:string|null):Record<string,unknown> {
 if(options.base_configuration_version!==BASE_CONFIGURATION_VERSION)return options;
 const result:Record<string,unknown>={...options,catalog_program_id:programId,quote_lab_program_id:programId};
 const group=programId?.match(/(?:price_group_|_pg)([1-4])/i)?.[1];
 if(group)result.price_group=`group${group}`;
 return result;
}
export function baseProgramMaterial(options:Record<string,unknown>):Partial<SalesQuoteDesign> {
 if(options.base_configuration_version!==BASE_CONFIGURATION_VERSION)return {};
 const id=String(options.catalog_product_id??options.quote_lab_product_id??'');
 return {material:getProduct(id)?.programs.find(p=>p.id===options.catalog_program_id)?.name??null};
}
