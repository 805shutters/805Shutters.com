import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SundancePortfolioOptions} from '@/components/crm/SundancePortfolioOptions';
import type {SelectionContext} from '@/lib/quote-v2/core';
import {validateSelection,productRuleStatusForSelection} from '@/lib/quote-v2/rules';
import {getMtsProductColorRows} from '@mts/lib/productColorCatalog';
import {getMtsProductColorRows as legacyRows} from '@/mts-quote-v1/lib/productColorCatalog';
import {sundancePortfolioColorPatch,sundancePortfolioStylePatch} from './portfolio-assortment';
import {validateSundancePortfolioConfiguration} from './portfolio-configuration';
function context(style='Knife Pleat',control='Cordless',width=36,height=60,code='ASE01'):SelectionContext {
 const patch=sundancePortfolioColorPatch({},`sundance_portfolio_roman:${code}:${style}`)!;
 return {manufacturerId:'sundance',productId:'sundance_portfolio_roman',programId:patch.catalog_program_id as string|null,catalogVersion:'sundance-assortment-2026-09-20-r14',catalogAsOf:'2026-09-20',widthInches:width,heightInches:height,quantity:1,configuration:{...patch,sundance_portfolio_control:control,sundance_portfolio_drop:style==='Hobbled'?'Waterfall':'Standard',sundance_portfolio_assembly:'Single',sundance_portfolio_liner:'LF03 Light-Filtering Ivory',mount_type:'Outside',sundance_portfolio_returns:'None',sundance_portfolio_front_valance:style==='Hobbled'?'None':'Included',sundance_portfolio_back_valance:control==='Cordless TDBU'?'Yes':'No',sundance_portfolio_interior_valance:'No',sundance_portfolio_valance_length:'Standard'} as SelectionContext['configuration'],options:{}};
}
it.each([['Cordless',16,96,25,96],['Cordless TDBU',24,48,24,72],['Clutch and Loop',16,96,18,96],['Somfy Sonesse Ultra 30',29.5,96,18,96],['Standard LI Motor',23.375,96,18,86],['Power Lift',30,96,18,96]])('validates source control boundaries for %s',(control,minW,maxW,minH,maxH)=>{
 for(const [w,h] of [[minW,minH],[maxW,maxH]])expect(validateSundancePortfolioConfiguration(context('Knife Pleat',String(control),Number(w),Number(h)))).toEqual([]);
 for(const [w,h] of [[Number(minW)-.0625,minH],[Number(maxW)+.0625,minH],[minW,Number(minH)-.0625],[minW,Number(maxH)+.0625]])expect(validateSundancePortfolioConfiguration(context('Knife Pleat',String(control),Number(w),Number(h))).map(i=>i.ruleId)).toContain('sundance.portfolio.size');
});
it('rejects hobbled height/drop and source-incompatible TDBU materials/styles',()=>{
 expect(validateSundancePortfolioConfiguration(context('Hobbled','Cordless',36,72))).toEqual([]);
 expect(validateSundancePortfolioConfiguration(context('Hobbled','Cordless',36,72.0625)).map(i=>i.ruleId)).toContain('sundance.portfolio.size');
 const h=context('Hobbled');h.configuration={...h.configuration,sundance_portfolio_drop:'Standard'};expect(validateSundancePortfolioConfiguration(h).map(i=>i.ruleId)).toContain('sundance.portfolio.drop_style');
 expect(validateSundancePortfolioConfiguration(context('Flat','Cordless TDBU',36,60,'CLL01')).map(i=>i.ruleId)).toContain('sundance.portfolio.tdbu');
 expect(validateSundancePortfolioConfiguration(context('Knife Pleat','Cordless TDBU',36,60,'CRV01')).map(i=>i.ruleId)).toContain('sundance.portfolio.tdbu');
});
function valance():SelectionContext {
 const c=context();const patch=sundancePortfolioColorPatch(c.configuration,'sundance_portfolio_roman:ASE01:Valance Only');
 // Selection is context-filtered; changing style first must clear old shade identity.
 const v=sundancePortfolioColorPatch(sundancePortfolioStylePatch(c.configuration,'Valance Only'),'sundance_portfolio_roman:ASE01:Valance Only')!;
 expect(patch).toBeNull();return {...c,programId:null,widthInches:96,heightInches:18,configuration:{...v,mount_type:'Outside',sundance_portfolio_valance_depth:2.5,sundance_portfolio_returns:'Extended'} as SelectionContext['configuration']};
}
it('routes all102 standalone materials separately from shade grids in both adapters',()=>{
 for(const getRows of [getMtsProductColorRows,legacyRows]){
  const rows=getRows('Roman Shades',{catalog_product_id:'sundance_portfolio_roman',quote_v2_backend:true,roman_style:'Valance Only'});expect(rows).toHaveLength(102);
  for(const row of rows){expect(row.programId).toBeNull();expect(row.automaticDetails.catalog_sundance_portfolio_valance_id).toMatch(/_p25_t1_[abcd]$/);}
 }
});
it('enforces standalone valance sizes, depth, returns, exact schedule and clears shade control',()=>{
 const v=valance();expect(validateSundancePortfolioConfiguration(v)).toEqual([]);expect(v.configuration.sundance_portfolio_control).toBeNull();
 for(const changes of [{widthInches:96.0625},{heightInches:18.0625},{heightInches:0}])expect(validateSundancePortfolioConfiguration({...v,...changes}).map(i=>i.ruleId)).toContain('sundance.portfolio.valance_size');
 for(const [changes,rule] of [[{mount_type:'Inside'},'valance_returns'],[{sundance_portfolio_valance_depth:3},'valance_depth'],[{catalog_sundance_portfolio_valance_id:'sundance_portfolio_roman_valance_p25_t1_d'},'valance_schedule'],[{sundance_portfolio_control:'Cordless'},'valance_shade_options']] as const)expect(validateSundancePortfolioConfiguration({...v,configuration:{...v.configuration,...changes}}).map(i=>i.ruleId)).toContain('sundance.portfolio.'+rule);
 expect(validateSelection({...v,heightInches:19}).map(i=>i.ruleId)).toContain('sundance.portfolio.valance_size');expect(productRuleStatusForSelection(v)).toBe('manual_quote_required');
});
it('shows standalone controls and withholds extended returns inside',()=>{
 const v=valance();const html=renderToStaticMarkup(createElement(SundancePortfolioOptions,{options:{...v.configuration,mount_type:'Inside',sundance_portfolio_returns:'Standard'},widthInches:96,heightInches:18,onUpdateFields:()=>{}}));
 expect(html).toContain('Sundance Portfolio valance depth');expect(html).not.toContain('<option>Extended</option>');expect(html).not.toContain('aria-label="Sundance Portfolio control"');expect(html).toContain('maximum width 96 inches and length 18 inches');
});
it('enforces returns, valances and bracket depth for saved shade configurations',()=>{
 const c=context('Knife Pleat','Cordless TDBU');
 expect(validateSundancePortfolioConfiguration({...c,configuration:{...c.configuration,mount_type:'Inside',sundance_portfolio_mount_depth:0.75,sundance_portfolio_returns:'None'}})).toEqual([]);
 for(const [patch,rule] of [[{mount_type:'Inside',sundance_portfolio_mount_depth:0.75,sundance_portfolio_returns:'Standard'},'shade_returns'],[{mount_type:'Inside',sundance_portfolio_mount_depth:0.6875},'mount_depth'],[{sundance_portfolio_back_valance:'No'},'back_valance'],[{sundance_portfolio_front_valance:'None'},'front_valance'],[{sundance_portfolio_interior_valance:'Yes'},'interior_valance'],[{sundance_portfolio_valance_length:'Custom',sundance_portfolio_custom_valance_length:8},'custom_valance_length']] as const)expect(validateSundancePortfolioConfiguration({...c,configuration:{...c.configuration,...patch}}).map(i=>i.ruleId)).toContain('sundance.portfolio.'+rule);
 const w=context('Hobbled');expect(validateSundancePortfolioConfiguration({...w,configuration:{...w.configuration,sundance_portfolio_front_valance:'Added',sundance_portfolio_back_valance:'Yes',sundance_portfolio_interior_valance:'Yes'}})).toEqual([]);
});
it('shows only no-return choice for inside-mount TDBU and includes front/back valances',()=>{
 const c=context('Knife Pleat','Cordless TDBU');const html=renderToStaticMarkup(createElement(SundancePortfolioOptions,{options:{...c.configuration,mount_type:'Inside',sundance_portfolio_mount_depth:0.75},widthInches:36,heightInches:60,onUpdateFields:()=>{}}));
 expect(html).toContain('Sundance Portfolio shade returns');expect(html).not.toContain('<option>Extended</option>');expect(html).toContain('Sundance Portfolio front valance');expect(html).toContain('Sundance Portfolio back valance');
});
it('blocks a saved Somfy accessory on a cordless shade at the server boundary',()=>{
 const c=context();expect(validateSelection({...c,configuration:{...c.configuration,sundance_portfolio_somfy_charger_qty:1}}).some(i=>i.ruleId.startsWith('sundance.portfolio.accessory_'))).toBe(true);
});

it('does not require a hidden interior valance default on preexisting standard shades',()=>{
 for(const missing of [undefined,null,'']){
  const c=context();const {sundance_portfolio_interior_valance: _c,...base}=c.configuration;c.configuration={...base,...(missing===undefined?{}:{sundance_portfolio_interior_valance:missing})};
  expect(validateSundancePortfolioConfiguration(c)).toEqual([]);
  const w=context('Hobbled');const {sundance_portfolio_interior_valance: _w,...waterfall}=w.configuration;w.configuration={...waterfall,...(missing===undefined?{}:{sundance_portfolio_interior_valance:missing})};
  expect(validateSundancePortfolioConfiguration(w).map(i=>i.ruleId)).toContain('sundance.portfolio.interior_valance');
 }
});
