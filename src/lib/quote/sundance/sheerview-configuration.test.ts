import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SundanceSheerviewOptions} from '@/components/crm/SundanceSheerviewOptions';
import type {SelectionContext} from '@/lib/quote-v2/core';
import {validateSelection,productRuleStatusForSelection} from '@/lib/quote-v2/rules';
import {sundanceSheerviewColorPatch} from './sheerview-assortment';
import {sundanceSheerviewControlPatch,sundanceSheerviewHeadrailPatch,validateSundanceSheerviewConfiguration} from './sheerview-configuration';
const options={...sundanceSheerviewColorPatch({},'sundance_sheerview:S50PN100')!,sundance_sheerview_control:'Continuous Cord Loop',sundance_sheerview_headrail:'Curved',sundance_sheerview_cord_option:'Cord',sundance_sheerview_assembly:'Single'};
function context(changes:Record<string,unknown>={},width=36,height=60):SelectionContext{return {manufacturerId:'sundance',productId:'sundance_sheerview',programId:'sundance_sheerview_p22_t1',catalogVersion:'sundance-assortment-2026-09-20-r13',catalogAsOf:'2026-09-20',widthInches:width,heightInches:height,quantity:1,configuration:{...options,...changes} as SelectionContext['configuration'],options:{}};}
it.each([
 ['Continuous Cord Loop','Curved',8,116,144],['Continuous Cord Loop','Flat Square',8,116,96],
 ['Cordless','Curved',20,96,96],['Cordless','No Drill',29,79,96],['Rechargeable Motor with Wand','Curved',22,116,144],
])('enforces exact %s/%s dimensional boundaries',(control,headrail,min,max,maxHeight)=>{
 const changes={sundance_sheerview_control:control,sundance_sheerview_headrail:headrail,sundance_sheerview_cord_option:control==='Continuous Cord Loop'?'Cord':null,catalog_sundance_sheerview_valance_id:headrail==='Flat Square'?'sundance_sheerview_valance_p24_t3':null};
 for(const [w,h] of [[min,11],[max,maxHeight]])expect(validateSundanceSheerviewConfiguration(context(changes,Number(w),Number(h)))).toEqual([]);
 for(const [w,h] of [[Number(min)-.0625,11],[Number(max)+.0625,11],[min,10.9375],[min,Number(maxHeight)+.0625]])expect(validateSundanceSheerviewConfiguration(context(changes,Number(w),Number(h))).map(i=>i.ruleId)).toContain('sundance.sheerview.size');
});
it('enforces RD flat headrail84-inch limit and rejects forged material routes',()=>{
 const rd=sundanceSheerviewColorPatch({},'sundance_sheerview:S50HN100D')!;
 const c=context({...rd,sundance_sheerview_headrail:'Flat Square',catalog_sundance_sheerview_valance_id:'sundance_sheerview_valance_p24_t3'},36,84);c.programId=String(rd.catalog_program_id);
 expect(validateSundanceSheerviewConfiguration(c)).toEqual([]);
 expect(validateSundanceSheerviewConfiguration({...c,heightInches:84.0625}).map(i=>i.ruleId)).toContain('sundance.sheerview.size');
 expect(validateSundanceSheerviewConfiguration({...c,programId:'sundance_sheerview_p22_t1'}).map(i=>i.ruleId)).toContain('sundance.sheerview.material');
});
it('retains explicit component hold and clears incompatible control/headrail selections',()=>{
 expect(validateSundanceSheerviewConfiguration(context({sundance_sheerview_assembly:'Two on one'})).map(i=>i.ruleId)).toContain('sundance.sheerview.assembly_components');
 expect(sundanceSheerviewHeadrailPatch(options,'No Drill')).toBeNull();
 expect(sundanceSheerviewControlPatch({...options,sundance_sheerview_headrail:'No Drill'},'Rechargeable Motor with Wand')).toMatchObject({sundance_sheerview_headrail:null,sundance_sheerview_cord_option:null});
 expect(sundanceSheerviewHeadrailPatch(options,'Flat Square')).toMatchObject({catalog_sundance_sheerview_valance_id:'sundance_sheerview_valance_p24_t3'});
 expect(sundanceSheerviewHeadrailPatch({catalog_sundance_sheerview_valance_id:'old'},'Curved')).toMatchObject({catalog_sundance_sheerview_valance_id:null});
});
it('applies the same rules at the authoritative selection boundary without opening price eligibility',()=>{
 const c=context({},116.0625,60);
 expect(validateSelection(c).map(i=>i.ruleId)).toContain('sundance.sheerview.size');
 expect(productRuleStatusForSelection(context())).toBe('manual_quote_required');
});
it('offers No Drill only for cordless and shows saved dimension errors',()=>{
 const render=(control:string)=>renderToStaticMarkup(createElement(SundanceSheerviewOptions,{options:{...options,sundance_sheerview_control:control},widthInches:100,heightInches:60,onUpdateFields:()=>{}}));
 expect(render('Continuous Cord Loop')).not.toContain('<option>No Drill</option>');
 expect(render('Cordless')).toContain('<option>No Drill</option>');
 expect(render('Cordless')).toContain('width 20–96 inches');
});
it('blocks saved incompatible accessories and clears their quantities on a control change',()=>{
 expect(validateSelection(context({sundance_sheerview_usb6_qty:1})).some(i=>i.ruleId.startsWith('sundance.sheerview.accessory_'))).toBe(true);
 expect(sundanceSheerviewControlPatch({...options,sundance_sheerview_usb6_qty:2},'Cordless')).toMatchObject({sundance_sheerview_usb6_qty:null});
});
