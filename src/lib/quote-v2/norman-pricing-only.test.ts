import { sourceProvenance } from './source-manifest';
import { describe, expect, it } from 'vitest';
import { normanHoneycombV2Source } from './generated/norman-honeycomb-v2.generated';
import { getProduct } from '@/lib/quote/catalog';
import { getProductColorOptions } from '@/lib/quote/product-color-options';
import { quoteV2CatalogVersionFor, expectedHoneycombProgramId, expectedVerticalHoneycombProgramId } from './catalog';
import { authoritativeAutomaticSurchargeSelections, priceQuoteV2Selection } from './engine';
import { deriveNormanOrderRecords } from './norman-assemblies';
import { quotePricingValidationIssues } from './quote-pricing-policy';
import { validateSelection } from './rules';
import type { SelectionContext, SelectionRecord } from './core';

const rows: [string,string,SelectionRecord][] = [
 ['roman','F0183',{lift_system:'Cordless',shade_type:'Single',fold_style:'Flat Fold with Batten Back',lining:'Translucent',seaming:'Vertical Seams',fabric_orientation:'Standard / Non-Railroaded',fabric_collection:'Lakeside'}],
 ['roller','F1484',{lift_system:'Cordless',roller_application:'Single',roller_top_treatment:'No Top Treatment',roller_tube:'All Tubes',roller_region_scope:'ca_ma',fabric_collection:'Amelia'}],
 ['honeycomb','',{cell_size:'3/4" Single Cell',lift_system:'Cordless',application:'Standard'}],
 ['vertical_honeycomb','',{cell_size:'3/4" Single Cell',lift_system:'Patio Door Vertical',application:'Patio Door Vertical',stacking_configuration:'Left Stack'}],
 ['smartfold','F1709',{lift_system:'PrecisionLift Cordless',fold_size:6,smartfold_installation:'Back / Wall Mount with Raceway',smartfold_shim_layers:0}],
 ['perfectsheer','F1179',{lift_system:'Continuous Cord Loop',valance:'Curved Fascia with Fabric',light_control:'Light Filtering'}],
 ['smartdrape','F1603',{lift_system:'Manual',control_type:'Manual',installation_method:'Wall Mount',stack_option:'Left Stack',mount_type:'Outside Mount'}],
 ['citylights_aluminum','7024',{slat_size:'1"',lift_system:'Cordless',light_control:'Regular Route Holes'}],
 ['wood_blinds','ND001',{slat_size:'2"',lift_system:'Cordless'}],
 ['faux_wood','',{valance:'None',product_line:'Ultimate',slat_size:'2"',finish_type:'Smooth',faux_configuration_version:'faux-wood-v2',faux_blind_count:1}],
 ['smartprivacy_faux','',{valance:'None',product_line:'SmartPrivacy',slat_size:'2"',finish_type:'Smooth',faux_configuration_version:'faux-wood-v2',faux_blind_count:1}],
 ['synchrony_vertical','',{stack_option:'Left Stack',draw_direction:'Left'}],
 ['palladian_shelf','',{color:'Winchester White 2010'}],
 ['norman_shutters','',{color:'001',louver_size:'3 1/2"',frame_type:'Direct Mount (No Frame)',measurement_basis:'frame_size',panel_config:'LR',tilt_type:'Standard Tilt'}],
];
function fixture(productId:string,code:string,c:SelectionRecord):SelectionContext {
 const available=getProductColorOptions(productId).filter(x=>x.available);
 const row=code?available.find(x=>x.colorCode===code):available.find(x=>x.colorName==='Pure White')??available[0];
 const config:SelectionRecord={mount_type:'Inside Mount',valance:'No Valance',...(row?.automaticDetails??{}),...(row?{fabric_color_id:row.id,fabric_color_code:row.colorCode,fabric_color_type:row.fabricType,fabric_collection:row.collection,color:row.colorName,fabric_color_name:row.colorName}:{}),...c};
 if(productId==='honeycomb'||productId==='vertical_honeycomb'){const f=normanHoneycombV2Source.activeColors.find(x=>x.family==='Light Filtering'&&x.cellSizes.some(v=>v==='3/4\" Single Cell'))!;Object.assign(config,{fabric_collection:f.family,fabric_color_code:f.customerColorCode});}
 let programId=row?.programId??getProduct(productId)!.programs[0].id;
 if(productId==='honeycomb'||productId==='vertical_honeycomb')programId=(productId==='honeycomb'?expectedHoneycombProgramId:expectedVerticalHoneycombProgramId)(String(config.fabric_collection),String(config.fabric_color_code),String(config.cell_size))??programId;
 if(productId==='palladian_shelf')programId='palladian_shelf_palladian_shelf_without_product';
 if(productId==='norman_shutters')programId='woodlore';
 return {manufacturerId:'Norman',productId,programId,catalogAsOf:'2026-09-21',catalogVersion:quoteV2CatalogVersionFor(productId,'2026-09-21'),widthInches:36,heightInches:60,quantity:1,configuration:config,options:{}};
}
function price(selection:SelectionContext, purpose:'quote'|'order'='quote') {
 const s=structuredClone(selection),additionalValidationIssues=deriveNormanOrderRecords([{lineId:'shade',selection:s}]);
 return priceQuoteV2Selection({selection:s,validationPurpose:purpose,additionalValidationIssues,priceInput:{productId:s.productId,programId:s.programId!,widthInches:s.widthInches,heightInches:s.heightInches,quantity:s.quantity,surcharges:authoritativeAutomaticSurchargeSelections(s)}});
}
describe('Norman prices do not require fabrication measurements',()=>{
 it.each(rows)('%s keeps the same grid and options without installation measurements',(productId,code,c)=>{
  const s=fixture(productId,code,c),priced=price(s);
  expect(priced.ok,JSON.stringify(priced.ok?priced:priced.validationIssues.filter(i=>i.severity==='hard_block').map(i=>({id:i.ruleId,text:i.explanation})))).toBe(true);
  const measured=structuredClone(s);Object.assign(measured.configuration,{mount_depth_inches:10,honeycomb_recess_depth_inches:10,honeycomb_mount_fit:'Fully Recessed',roman_mount_fit:'Flush Inside',shelf_depth:3,shelf_supported_weight_lbs:20,smartfold_clearance_v1:{version:1,mountingAreaHeight:10,mountingSpaceHeight:10}});
  const comparison=price(measured);expect(comparison.ok,JSON.stringify(comparison.ok?comparison:comparison.validationIssues.filter(i=>i.severity==='hard_block').map(i=>({id:i.ruleId,text:i.explanation})))).toBe(true);
  if(priced.ok&&comparison.ok){expect(priced.base).toBe(comparison.base);expect(priced.unitPrice).toBe(comparison.unitPrice);expect(priced.surchargeLines).toEqual(comparison.surchargeLines);}
 });
 it('keeps SmartFold individual grid and option amounts unchanged by door or matching metadata',()=>{
  const s=fixture(...rows.find(r=>r[0]==='smartfold')!),base=price(s);
  s.configuration={...s.configuration,installed_on_door:true,smartfold_side_by_side_id:'G1'};
  const matched=price(s);expect(base.ok).toBe(true);expect(matched.ok,JSON.stringify(matched)).toBe(true);
  if(base.ok&&matched.ok){expect(matched.base).toBe(base.base);expect(matched.unitPrice).toBe(base.unitPrice);expect(matched.surchargeLines).toEqual(base.surchargeLines);}
 });
 it.each(['woodlore','woodlore_plus','woodlore_aquashield','brightwood','normandy_painted','normandy_stained'])('prices %s without finished panel or installation schedules',programId=>{
  const s=fixture('norman_shutters','',{color:'001',louver_size:'3 1/2\"',frame_type:'Direct Mount (No Frame)',measurement_basis:'frame_size',panel_config:'LR'});s.programId=programId;
  if(programId==='normandy_stained')s.configuration={...s.configuration,color:'205',fabric_color_code:'205'};
  const r=price(s);expect(r.ok,JSON.stringify(r.ok?r:r.validationIssues.filter(i=>i.severity==='hard_block'))).toBe(true);
 });
 it.each(['honeycomb.matrix.standard_cordless.max_width','honeycomb.motorization.dimension.norman-smart-skylight.min_width','roman.motorization.dimension.automate-12v-dc.max_area','smartfold.motorization.dimension.autowand.max_height','perfectsheer.motorization.dimension.norman_smart-1.75-battery.max_width','honeycomb.matrix.specialty.net_measurements','norman.palladian_shelf.load','norman.shutter.dividers.louver_clearance'])('retains %s only for ordering',ruleId=>{
  const issue={severity:'hard_block' as const,ruleId,source:sourceProvenance('norman-retail-guide-2026-09'),selectedValues:{},explanation:'Manufacturing check'};
  expect(quotePricingValidationIssues([issue])[0]).toMatchObject({severity:'warning',explanation:'Before ordering: Manufacturing check'});expect(issue.severity).toBe('hard_block');
 });
 it('needs a vertical attachment only when it determines a purchased shim quantity',()=>{
  const s=fixture(...rows.find(r=>r[0]==='vertical_honeycomb')!);s.configuration={...s.configuration,vertical_shim_layers:1};
  const r=price(s);expect(r.ok).toBe(false);if(!r.ok)expect(r.validationIssues).toEqual(expect.arrayContaining([expect.objectContaining({ruleId:'honeycomb.vertical.mounting',severity:'hard_block'})]));
 });
 it('still rejects sizes outside actual available grid cells',()=>{const s=fixture('wood_blinds','ND001',{slat_size:'2\"'});s.widthInches=10000;expect(price(s).ok).toBe(false);});
 it('keeps unknown prices and identities hard while preserving order validation',()=>{
  for(const id of ['honeycomb.program.fabric_cell_mismatch','roller.program.fabric_mismatch','norman.shutter.frame_pricing.unsupported_frame','norman.shutter.dividers.custom_charge','norman.ultimate_faux.keystone_price_basis','roman.common_valance.two_panel_widths_required','norman.motorization.shared_panel_capacity','norman.shutter.french_door.source_missing','unknown.new_price_rule']) {
   const issue={severity:'hard_block' as const,ruleId:id,source:sourceProvenance('norman-retail-guide-2026-09'),selectedValues:{},explanation:'Actual unresolved price input'};
   expect(quotePricingValidationIssues([issue])[0]).toEqual(issue);
  }
  const s=fixture('wood_blinds','ND001',{slat_size:'2"',lift_system:'Cordless'});
  expect(validateSelection(s).some(i=>i.ruleId==='norman.wood_blinds.mount_depth'&&i.severity==='hard_block')).toBe(true);
  expect(price(s,'order').ok).toBe(false);
 });
});
