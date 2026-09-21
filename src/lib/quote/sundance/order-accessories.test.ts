import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {SelectionContext,SelectionRecord} from '@/lib/quote-v2/core';
import type {SalesQuoteDesign} from '@mts/types/quote';
import {getQuoteDesignDetails} from '@mts/lib/quoteDesignDetails';
import {SundanceSharedAccessories} from '@/components/crm/SundanceSharedAccessories';
import {createSundanceAssembly,SUNDANCE_ASSEMBLY_KEY,sundanceComponentConfiguration} from './assembly-records';
import {createSundanceWaldenTwin,SUNDANCE_WALDEN_TWIN_KEY} from './walden-twin-records';
import {sundanceSharedAccessoryCatalog} from './order-accessory-catalog';
import {deriveSundanceOrderAccessories,readSundanceAccessoryAssignments,sundanceAccessoryTargets,sundanceSharedAccessoryInputIssues,validateSundanceSharedAccessories,SUNDANCE_SHARED_ACCESSORIES_KEY as INPUT,SUNDANCE_ORDER_ACCESSORIES_KEY as OUTPUT} from './order-accessories';
function assignments(key='situo5',targetId='line',deviceId='Living remote'){return {version:1,assignments:[{deviceId,targetId,accessoryKey:key}]};}
function line(lineId='a',quantity=1,configuration:SelectionRecord={},productId='sundance_walden_premier'):{lineId:string;selection:SelectionContext}{
 return {lineId,selection:{manufacturerId:'sundance',productId,programId:null,catalogVersion:'test',catalogAsOf:'2026-09-20',widthInches:36,heightInches:60,quantity,options:{},configuration:{sundance_walden_control:'Somfy Sonesse Ultra 30',[INPUT]:assignments(),...configuration} as SelectionRecord}};
}
function devices(l:ReturnType<typeof line>){return (l.selection.configuration[OUTPUT] as {devices:SelectionRecord[]}|undefined)?.devices??[];}
it('charges one published $185 retail five-shade remote once across lines and rebuilds reopened ownership',()=>{
 const a=line('a',2),b=line('b',3);expect(deriveSundanceOrderAccessories([b,a])).toEqual([]);
 expect(devices(a)[0]).toMatchObject({totalMotors:5,capacity:5,capacitySourcePage:9,sourceCharge:185,sourceBasis:'retail',ownerLineId:'a',sourcePage:23,customerPriceEligible:false});
 expect(devices(b)[0].sourceCharge).toBe(0);
 const reopened=JSON.parse(JSON.stringify([a,b]));expect(deriveSundanceOrderAccessories(reopened)).toEqual([]);expect(devices(reopened[0])).toEqual(devices(a));
 b.selection.quantity=4;expect(deriveSundanceOrderAccessories([a,b]).map(i=>i.ruleId)).toEqual(['sundance.order_accessory.capacity','sundance.order_accessory.capacity']);expect(devices(a)).toEqual([]);expect(devices(b)).toEqual([]);
 b.selection.quantity=3;deriveSundanceOrderAccessories([b]);expect(devices(b)[0]).toMatchObject({ownerLineId:'b',totalMotors:3,sourceCharge:185});
});
it('uses the SheerView 20-shades-per-channel source instead of assuming one channel means one shade',()=>{
 const a=line('a',20,{sundance_sheerview_control:'Rechargeable Motor with Wand',[INPUT]:assignments('single_remote')},'sundance_sheerview');
 expect(deriveSundanceOrderAccessories([a])).toEqual([]);expect(devices(a)[0]).toMatchObject({capacity:20,capacitySourcePage:17,sourceCharge:133});
 a.selection.quantity=21;expect(deriveSundanceOrderAccessories([a])[0].ruleId).toBe('sundance.order_accessory.capacity');
});
it('does not invent limits for unspecified multi-channel or charger capacity',()=>{
 const a=line('a',2,{sundance_sheerview_control:'Rechargeable Motor with Wand',[INPUT]:assignments('multi_remote')},'sundance_sheerview');
 deriveSundanceOrderAccessories([a]);expect(devices(a)[0]).toMatchObject({capacity:null,customerPriceEligible:false,sourceCharge:167});expect(devices(a)[0].configurationReview).toContain('does not establish');
});
it('keeps conflicting source prices and incompatible controls blocked at local and order boundaries',()=>{
 const p=line('p',1,{sundance_portfolio_control:'Somfy Sonesse Ultra 30',[INPUT]:assignments('somfy_wall5')},'sundance_portfolio_roman');
 expect(validateSundanceSharedAccessories(p.selection)[0].explanation).toContain('$40');expect(deriveSundanceOrderAccessories([p])[0].ruleId).toBe('sundance.order_accessory.input');
 const a=line();a.selection.configuration={...a.selection.configuration,sundance_walden_control:'Cordless'};expect(sundanceSharedAccessoryInputIssues(a.selection.productId,a.selection.configuration)[0]).toContain('not documented');
});
it.each([0,1.5])('propagates invalid connected quantity %s to the full device group',quantity=>{
 const a=line(),b=line('b',quantity);expect(deriveSundanceOrderAccessories([a,b]).map(i=>i.ruleId)).toContain('sundance.order_accessory.incomplete_group');expect(devices(a)).toEqual([]);
});
it('blocks duplicate legacy quantities, repeated targets and incomplete fields without losing editable records',()=>{
 const a=line(),b=line('b',1,{sundance_walden_accessory_situo5_qty:1});
 expect(deriveSundanceOrderAccessories([a,b]).map(i=>i.ruleId)).toContain('sundance.order_accessory.incomplete_group');expect(devices(a)).toEqual([]);
 const record=assignments();record.assignments.push({...record.assignments[0]});a.selection.configuration={...a.selection.configuration,[INPUT]:record};
 expect(sundanceSharedAccessoryInputIssues(a.selection.productId,a.selection.configuration)[0]).toContain('twice');
 const incomplete=assignments('','','');expect(readSundanceAccessoryAssignments(incomplete)).toEqual(incomplete);
 expect(readSundanceAccessoryAssignments({version:2,assignments:[]})).toBeNull();
 const html=renderToStaticMarkup(createElement(SundanceSharedAccessories,{productId:a.selection.productId,options:{sundance_walden_control:'Somfy Sonesse Ultra 30',[INPUT]:incomplete},onChange:()=>{}}));
 expect(html).toContain('Sundance shared accessory 1 device name');expect(html).toContain('Select motor');expect(html).toContain('1–80 characters');
});
it('keeps family-specific identities separate even at the same source price and clears forged allocations',()=>{
 const a=line(),b=line('b',1,{},'sundance_walden_select');a.selection.configuration={...a.selection.configuration,[OUTPUT]:{version:1,devices:[{sourceCharge:0}]}};
 expect(deriveSundanceOrderAccessories([a,b]).map(i=>i.ruleId)).toContain('sundance.order_accessory.identity');expect(devices(a)).toEqual([]);
 const premier=sundanceSharedAccessoryCatalog('sundance_walden_premier',{}).find(a=>a.key==='pro_hub');const select=sundanceSharedAccessoryCatalog('sundance_walden_select',{}).find(a=>a.key==='pro_hub');expect(premier?.unitSource).toBe(458);expect(select?.unitSource).toBe(468);
});
it('counts independent assembly motors and preserves actual component index for a coupled owner',()=>{
 const l=line('assembly',2,{sundance_shade_control:'Simphony 24V DC',sundance_shade_assembly:'Dual independent'},'sundance_roller');
 const a=createSundanceAssembly(l.selection.productId,l.selection.configuration,['front','rear'])!;l.selection.configuration={...l.selection.configuration,[SUNDANCE_ASSEMBLY_KEY]:a as unknown as SelectionRecord};
 l.selection.configuration={...l.selection.configuration,[INPUT]:{version:1,assignments:[...assignments('simphony_remote','front').assignments,...assignments('simphony_remote','rear').assignments]}};
 expect(deriveSundanceOrderAccessories([l])).toEqual([]);expect(devices(l)).toHaveLength(1);expect(devices(l)[0]).toMatchObject({totalMotors:4,sourceCharge:90,sourceBasis:'net'});
 l.selection.configuration={...l.selection.configuration,sundance_shade_assembly:'Coupled motorized'};a.selection='Coupled motorized';a.sharedMotorComponentId='rear';
 expect(sundanceAccessoryTargets(l.selection.productId,l.selection.configuration).map(t=>[t.id,t.label])).toEqual([['rear','Component 2']]);
 expect(deriveSundanceOrderAccessories([l])[0].ruleId).toBe('sundance.order_accessory.input');
 l.selection.configuration={...l.selection.configuration,[INPUT]:assignments('simphony_remote','rear')};expect(deriveSundanceOrderAccessories([l])).toEqual([]);expect(devices(l)[0].totalMotors).toBe(2);
 a.components[0].id='rear';expect(sundanceAccessoryTargets(l.selection.productId,l.selection.configuration)).toEqual([]);
});
it('retains two independent Walden twin motor connections and detects rear legacy duplication',()=>{
 const l=line('twin',1,{walden_movable_liner:'Yes'}),t=createSundanceWaldenTwin(l.selection.productId,l.selection.configuration,36,60,['front','liner'])!;
 t.liner.control='Somfy Sonesse Ultra 30';l.selection.configuration={...l.selection.configuration,[SUNDANCE_WALDEN_TWIN_KEY]:t as unknown as SelectionRecord};
 l.selection.configuration={...l.selection.configuration,[INPUT]:{version:1,assignments:[...assignments('situo5','front').assignments,...assignments('situo5','liner').assignments]}};
 expect(deriveSundanceOrderAccessories([l])).toEqual([]);expect(devices(l)[0]).toMatchObject({totalMotors:2,sourceCharge:185});
 t.liner.accessoryQuantities.situo5=1;expect(deriveSundanceOrderAccessories([l])[0].explanation).toContain('clear the separate');
});
it('keeps shared IDs/source charges out of customer descriptions and new component clones',()=>{
 const l=line();deriveSundanceOrderAccessories([l]);
 expect(getQuoteDesignDetails({options_json:{[INPUT]:l.selection.configuration[INPUT],[OUTPUT]:l.selection.configuration[OUTPUT]}} as unknown as SalesQuoteDesign)).toEqual([]);
 const clone=sundanceComponentConfiguration(l.selection.configuration);expect(clone[INPUT]).toBeUndefined();expect(clone[OUTPUT]).toBeUndefined();
});
