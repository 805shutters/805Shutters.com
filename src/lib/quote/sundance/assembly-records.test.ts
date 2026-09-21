import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createSundanceAssembly,readSundanceAssembly,sundanceAssemblySpec,sundanceAssemblyDescriptions,SUNDANCE_ASSEMBLY_KEY,type SundanceAssembly} from './assembly-records';
import {validateSundanceAssembly,sundanceComponentSourceGrid,sundanceAssemblyBaseEvidence} from './assembly-validation';
import {sundanceCellularSelectionPatch} from './configuration';
import {sundanceCellularSystemPatch} from './cellular-configuration';
import {sundanceHorizontalProductIds} from './horizontal-assortment';
import {SundanceDesignOptions} from '@/components/crm/SundanceDesignOptions';
import {getQuoteDesignDetails} from '@mts/lib/quoteDesignDetails';
import {detailDisplayValue} from '../product-options';
import type {SalesQuoteDesign} from '@mts/types/quote';
import type {SelectionContext} from '@/lib/quote-v2/core';
import {validateSelection,productRuleStatusForSelection} from '@/lib/quote-v2/rules';
function fixture(){
  const options={...sundanceCellularSystemPatch(sundanceCellularSelectionPatch({},'sundance_cellular:PS310-001')!,'Cordless'),mount_type:'Inside',sundance_cellular_assembly:'Two on one',sundance_cellular_somfy_charger_qty:1};
  const assembly=createSundanceAssembly('sundance_cellular',options,['left','right'])!;
  assembly.components=assembly.components.map((c,i)=>({...c,widthInches:i?42:30,heightInches:60}));
  return {options,assembly};
}
function context(assembly:SundanceAssembly):SelectionContext{const {options}=fixture();return{manufacturerId:'sundance',productId:'sundance_cellular',programId:'sundance_cellular_p7_t1',catalogVersion:'sundance-assortment-2026-09-20-r14',catalogAsOf:'2026-09-20',widthInches:72,heightInches:60,quantity:1,options:{},configuration:{...options,sundance_cellular_somfy_charger_qty:null,[SUNDANCE_ASSEMBLY_KEY]:assembly} as unknown as SelectionContext['configuration']};}
it('retains distinct component identity and exact fabric/program through JSON without cloning accessories or parent dimensions',()=>{
 const {options,assembly}=fixture();const fresh=createSundanceAssembly('sundance_cellular',options,['a','b'])!;
 expect(fresh.components.map(c=>c.widthInches)).toEqual([null,null]);
 expect(fresh.components[0].configuration).toMatchObject({fabric_color_id:'sundance_cellular:PS310-001',catalog_program_id:'sundance_cellular_p7_t1',sundance_cellular_assembly:'Single'});
 expect(fresh.components[0].configuration.sundance_cellular_somfy_charger_qty).toBeUndefined();
 expect(options.sundance_cellular_somfy_charger_qty).toBe(1);
 expect(readSundanceAssembly(JSON.parse(JSON.stringify(assembly)))).toEqual(assembly);
 expect(validateSundanceAssembly(context(assembly))).toEqual([]);
 expect(sundanceComponentSourceGrid(assembly.components[0])?.gridWidth).toBe(30);
 expect(sundanceComponentSourceGrid(assembly.components[1])?.gridWidth).toBe(42);
});
it.each(sundanceHorizontalProductIds)('recognizes exact horizontal family %s without fabric-family aliases',p=>{
 expect(sundanceAssemblySpec(p,{sundance_blind_assembly:'Three on one'})).toMatchObject({count:3,selectionKey:'sundance_blind_assembly'});
});
it.each(['sundance_cellular','sundance_sheerview','sundance_portfolio_roman','sundance_walden_premier','sundance_walden_select','sundance_zebra','sundance_louvolite_zebra','sundance_roller','sundance_louvolite_roller','sundance_flat_roman','sundance_louvolite_flat_roman'])('accounts for %s common-headrail records',productId=>{
 const c={sundance_cellular_assembly:'Two on one',sundance_sheerview_assembly:'Two on one',sundance_portfolio_assembly:'Two on one',sundance_walden_assembly:'Two on one',sundance_zebra_assembly:'Two on one',sundance_shade_assembly:'Two on one'};
 expect(createSundanceAssembly(productId,c,['1','2'])?.components.map(x=>x.productId)).toEqual([productId,productId]);
});
it('rejects unsupported versions, malformed records, wrong counts and duplicate identities',()=>{
 const {assembly}=fixture();for(const bad of [null,[],{...assembly,version:2},{...assembly,components:[{}]},{...assembly,components:[...assembly.components,...assembly.components]}])expect(readSundanceAssembly(bad)).toBeNull();
 expect(createSundanceAssembly('sundance_cellular',fixture().options,['same','same'])).toBeNull();
 assembly.components[1].id='left';expect(validateSundanceAssembly(context(assembly)).map(i=>i.ruleId)).toContain('sundance.assembly.duplicate_ids');
});
it('blocks stale assembly selection, cross-product components and nested assemblies',()=>{
 const {assembly}=fixture();const s=context(assembly);
 expect(validateSundanceAssembly({...s,configuration:{...s.configuration,sundance_cellular_assembly:'Single'}}).map(i=>i.ruleId)).toContain('sundance.assembly.stale');
 assembly.components[0].productId='sundance_roller';expect(validateSundanceAssembly(context(assembly)).map(i=>i.ruleId)).toContain('sundance.assembly.product');
 assembly.components[0].productId='sundance_cellular';assembly.components[0].configuration={...assembly.components[0].configuration,sundance_cellular_assembly:'Two on one'};
 expect(validateSundanceAssembly(context(assembly)).map(i=>i.ruleId)).toContain('sundance.assembly.nested');
});
it('validates each fabric identity and operating limits on saved/server selections',()=>{
 const {assembly}=fixture();assembly.components[1].widthInches=96.0625;
 const ids=validateSelection(context(assembly)).map(i=>i.ruleId);
 expect(ids).toContain('sundance.assembly.component_2.sundance.cellular.size');expect(ids).toContain('sundance.assembly.width');
 assembly.components[1].widthInches=42;assembly.components[1].configuration={...assembly.components[1].configuration,catalog_program_id:'sundance_cellular_p11_t1'};
 expect(validateSundanceAssembly(context(assembly)).map(i=>i.ruleId)).toContain('sundance.assembly.component_2.sundance.cellular.material');
});
it('never infers a combined customer price or releases the existing complete-assembly pricing hold',()=>{
 const {assembly}=fixture();const s=context(assembly);
 expect(productRuleStatusForSelection(s)).toBe('manual_quote_required');
 expect(validateSelection(s).map(i=>i.ruleId)).toContain('sundance.cellular.components');
});
it('requires the shared motor reference only for coupled motorized assemblies',()=>{
 const options={sundance_shade_assembly:'Coupled motorized'};const assembly=createSundanceAssembly('sundance_roller',options,['a','b'])!;
 const s={productId:'sundance_roller',widthInches:72,heightInches:60,configuration:{...options,[SUNDANCE_ASSEMBLY_KEY]:assembly} as unknown as SelectionContext['configuration']};
 expect(validateSundanceAssembly(s).map(i=>i.ruleId)).toContain('sundance.assembly.motor_owner');
 assembly.sharedMotorComponentId='a';expect(validateSundanceAssembly(s).map(i=>i.ruleId)).not.toContain('sundance.assembly.motor_owner');
});
it('renders separately editable dimensions and prevents recursively generated component editors',()=>{
 const {assembly}=fixture();const html=renderToStaticMarkup(createElement(SundanceDesignOptions,{productId:'sundance_cellular',design:{options_json:context(assembly).configuration},widthInches:72,heightInches:60,onUpdateFields:()=>{}}));
 expect(html).toContain('Sundance component 1 width');expect(html).toContain('Sundance component 2 height');
 expect(html.match(/aria-label="Sundance assembly components"/g)).toHaveLength(1);expect(html).toContain('Source base retail');
});
it('publishes human component dimensions and identity without raw IDs, source/account data or prices',()=>{
 const {assembly}=fixture();assembly.components[0].configuration={...assembly.components[0].configuration,dealer_cost:999,source_net:888};
 const expected=sundanceAssemblyDescriptions(assembly);expect(expected).toHaveLength(2);expect(expected[0]).toContain('30 × 60 inches');expect(expected[1]).toContain('42 × 60 inches');
 const design={options_json:{[SUNDANCE_ASSEMBLY_KEY]:assembly}} as unknown as SalesQuoteDesign;
 const details=getQuoteDesignDetails(design).map(d=>`${d.label}: ${d.value}`);expect(details).toEqual(expected);
 const publicText=detailDisplayValue('sundance_cellular',SUNDANCE_ASSEMBLY_KEY,assembly)!;
 expect(publicText).toContain('PS310-001');for(const hidden of ['dealer_cost','999','888','sundance_cellular_p7_t1','version','left','right'])expect(publicText).not.toContain(hidden);
});

it('sums independently cited base cells only after every component validates',()=>{
 const {assembly}=fixture();
 // I PDF7 independently transcribed:30×60=431 and42×60=558.
 expect(sundanceAssemblyBaseEvidence(context(assembly))).toEqual({retailSubtotal:989,componentCount:2,customerPriceEligible:false});
 assembly.components[1].widthInches=200;
 expect(sundanceAssemblyBaseEvidence(context(assembly)).retailSubtotal).toBeNull();
 assembly.components[1].widthInches=42;assembly.components[1].configuration={...assembly.components[1].configuration,fabric_color_id:'wrong'};
 expect(sundanceAssemblyBaseEvidence(context(assembly)).retailSubtotal).toBeNull();
});
