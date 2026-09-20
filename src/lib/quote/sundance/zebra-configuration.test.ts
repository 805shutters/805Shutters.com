import { expect,it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SelectionContext } from '@/lib/quote-v2/core';
import { validateSelection,productRuleStatusForSelection } from '@/lib/quote-v2/rules';
import { SundanceZebraConfiguration } from '@/components/crm/SundanceZebraConfiguration';
import { sundanceShadeColors,sundanceShadeColorPatch } from './shade-fabrics';
import { validateSundanceZebraConfiguration as validate,sundanceZebraControlPatch,sundanceZebraOptionEvidence } from './zebra-configuration';
function context(control='Beaded Chain',w=36,h=60):SelectionContext {
 const row=sundanceShadeColors.find(row=>row.productId==='sundance_zebra'&&row.colorName==='ORLANDO BLACKOUT BL2901')!;
 const patch=sundanceShadeColorPatch({},'sundance_zebra',row.id)!;
 return {manufacturerId:'sundance',productId:'sundance_zebra',programId:row.programId,catalogVersion:'sundance-assortment-2026-09-20-r14',catalogAsOf:'2026-09-20',widthInches:w,heightInches:h,quantity:1,configuration:{...patch,sundance_zebra_control:control,sundance_zebra_cassette:'3-inch Square Aluminum',sundance_zebra_cassette_color:'Black',sundance_zebra_chain:control==='Beaded Chain'?'White':null,mount_type:'Inside',sundance_zebra_assembly:'Single'} as SelectionContext['configuration'],options:{}};
}
it.each([
 ['Beaded Chain',10,0],['Cordless',10,45],['Somfy Sonesse Ultra 30 WireFree RTS Li-ion',22,220],['Somfy Sonesse 30 RTS 24V DC',21,293],
 ['Alpha Motor 30 2Nm Li-ion',23,165],['Alpha Motor 30 3Nm Li-ion',23,200],['Alpha Motor 40 5Nm Li-ion',29,250],['Simphony Motor 2Nm Li-ion',17,150],['Quiet Touch Wand',21,100],
])('verifies %s minimum and96-inch product cap plus independent net charge', (system,min,net)=>{
 expect(validate(context(String(system),Number(min),16))).toEqual([]);expect(validate(context(String(system),96,96))).toEqual([]);
 for(const [w,h] of [[Number(min)-.0625,60],[96.0625,60],[36,15.9375],[36,96.0625]])expect(validate(context(String(system),w,h)).map(i=>i.ruleId)).toContain('sundance.zebra.size');
 expect(sundanceZebraOptionEvidence(context(String(system)).configuration).netSubtotal).toBe(net);
});
it('keeps exact fabric/grid identity and validates cassette, chain and mount choices',()=>{
 const c=context();expect(validateSelection({...c,programId:'sundance_zebra_p5_t2'}).map(i=>i.ruleId)).toContain('sundance.zebra.material');
 for(const [patch,rule] of [[{sundance_zebra_cassette:'Unknown'},'cassette'],[{sundance_zebra_cassette_color:'Red'},'cassette_color'],[{sundance_zebra_chain:'Red'},'chain'],[{mount_type:''},'mount'],[{sundance_zebra_cutouts:'Yes'},'cutouts']] as const)
  expect(validate({...c,configuration:{...c.configuration,...patch}}).map(i=>i.ruleId)).toContain(`sundance.zebra.${rule}`);
 expect(productRuleStatusForSelection(c)).toBe('manual_quote_required');
});
it('clears chain choices on control changes and keeps alignment/components explicitly unresolved',()=>{
 const c=context();const motor=sundanceZebraControlPatch(c.configuration,'Quiet Touch Wand');expect(motor.sundance_zebra_chain).toBeNull();
 expect(validate({...c,configuration:{...c.configuration,sundance_zebra_control:'Quiet Touch Wand'}}).map(i=>i.ruleId)).toContain('sundance.zebra.stale_chain');
 const two={...c.configuration,sundance_zebra_assembly:'Two on one',sundance_zebra_chain:'Stainless Steel',sundance_zebra_alignment_group:'Internal A'};
 expect(validate({...c,configuration:two}).map(i=>i.ruleId)).toEqual(expect.arrayContaining(['sundance.zebra.components','sundance.zebra.alignment']));
 const e=sundanceZebraOptionEvidence(two);expect(e.netSubtotal).toBe(45);expect(e.customerPriceEligible).toBe(false);
});
it('renders all documented motor/control and top-treatment choices without tile cut-out selection',()=>{
 const c=context();const html=renderToStaticMarkup(createElement(SundanceZebraConfiguration,{options:c.configuration,widthInches:36,heightInches:60,onUpdateFields:()=>{}}));
 expect(html).toContain('Somfy Sonesse 30 RTS 24V DC');expect(html).toContain('Stainless Steel');expect(html).toContain('3-inch Square Aluminum');expect(html).toContain('No tile cut-outs');
 const motor=renderToStaticMarkup(createElement(SundanceZebraConfiguration,{options:context('Quiet Touch Wand').configuration,widthInches:36,heightInches:60,onUpdateFields:()=>{}}));expect(motor).not.toContain('aria-label="Sundance Zebra chain"');
});
