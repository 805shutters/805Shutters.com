import {expect,it} from 'vitest';
import type {SelectionContext,SelectionRecord} from '@/lib/quote-v2/core';
import {createSundanceAssembly,SUNDANCE_ASSEMBLY_KEY} from './assembly-records';
import {deriveSundanceOrderPower,SUNDANCE_ORDER_POWER_KEY,SUNDANCE_PANEL_ID_KEY,type SundanceOrderLine} from './order-power';
import {sundanceShadeConfigurationPatch} from './shade-configuration';
import {getQuoteDesignDetails} from '@mts/lib/quoteDesignDetails';
import type {SalesQuoteDesign} from '@mts/types/quote';

function line(lineId:string,quantity=1,configuration:SelectionRecord={},productId='sundance_roller'):SundanceOrderLine {
 return {lineId,selection:{manufacturerId:'sundance',productId,programId:null,catalogVersion:'test',catalogAsOf:'2026-09-20',widthInches:36,heightInches:60,quantity,options:{},configuration:{sundance_shade_control:'Simphony 24V DC',[SUNDANCE_PANEL_ID_KEY]:'Panel 1',...configuration}}};
}
function panels(l:SundanceOrderLine){return (l.selection.configuration[SUNDANCE_ORDER_POWER_KEY] as {panels:SelectionRecord[]}|undefined)?.panels??[];}
function assemblyLine(selection='Dual independent',quantity=1){
 const l=line('assembly',quantity,{sundance_shade_assembly:selection,[SUNDANCE_PANEL_ID_KEY]:null});
 const a=createSundanceAssembly(l.selection.productId,l.selection.configuration,['front','rear'])!;
 a.components.forEach(c=>{c.widthInches=36;c.heightInches=60;c.configuration={...c.configuration,[SUNDANCE_PANEL_ID_KEY]:'Panel 1'};});
 l.selection.configuration={...l.selection.configuration,[SUNDANCE_ASSEMBLY_KEY]:a as unknown as SelectionRecord};
 return {l,a};
}
it('derives the published 18-motor limit and $800 net charge once across selected families and quantities',()=>{
 const a=line('a',10),b=line('b',8,{},'sundance_louvolite_roller');
 expect(deriveSundanceOrderPower([b,a])).toEqual([]);
 expect(panels(a)[0]).toMatchObject({capacity:18,totalMotors:18,sourceNetCharge:800,ownerLineId:'a',customerPriceEligible:false,sourcePage:29});
 expect(panels(b)[0]).toMatchObject({sourceNetCharge:0,sourcePage:17,connected:[{lineId:'a',componentId:null,motorQuantity:10},{lineId:'b',componentId:null,motorQuantity:8}]});
 b.selection.quantity=9;
 expect(deriveSundanceOrderPower([a,b]).map(i=>i.selectedValues?.lineId)).toEqual(['a','b']);
 expect(panels(a)).toEqual([]);expect(panels(b)).toEqual([]);
 b.selection.quantity=8;deriveSundanceOrderPower([a,b]);expect(panels(a)[0].totalMotors).toBe(18);
});
it('recomputes forged allocations and restores ownership when a selected line is removed',()=>{
 const a=line('a'),b=line('b',1,{[SUNDANCE_ORDER_POWER_KEY]:{version:99,panels:[{sourceNetCharge:0,totalMotors:0}]}});
 deriveSundanceOrderPower([a,b]);const snapshot=JSON.stringify(b.selection.configuration);
 deriveSundanceOrderPower([b,a]);expect(JSON.stringify(b.selection.configuration)).toBe(snapshot);
 deriveSundanceOrderPower([b]);expect(panels(b)[0]).toMatchObject({totalMotors:1,ownerLineId:'b',sourceNetCharge:800});
 b.selection.configuration={...b.selection.configuration,[SUNDANCE_PANEL_ID_KEY]:null};deriveSundanceOrderPower([b]);expect(panels(b)).toEqual([]);
});
it('counts both independent component motors and line quantity while charging a same-line panel only once',()=>{
 const {l}=assemblyLine('Dual independent',9);expect(deriveSundanceOrderPower([l])).toEqual([]);
 expect(panels(l)).toHaveLength(1);expect(panels(l)[0]).toMatchObject({totalMotors:18,sourceNetCharge:800,ownerComponentId:'front',connected:[{lineId:'assembly',componentId:'front',motorQuantity:9},{lineId:'assembly',componentId:'rear',motorQuantity:9}]});
 l.selection.quantity=10;expect(deriveSundanceOrderPower([l])[0].ruleId).toBe('sundance.order_power.capacity');
});
it('counts one coupled motor and rejects duplicate connection on the slave component',()=>{
 const {l,a}=assemblyLine('Coupled motorized',18);a.sharedMotorComponentId='rear';
 expect(deriveSundanceOrderPower([l]).map(i=>i.ruleId)).toContain('sundance.order_power.duplicate_coupled_motor');
 a.components[0].configuration={...a.components[0].configuration,[SUNDANCE_PANEL_ID_KEY]:null};
 expect(deriveSundanceOrderPower([l])).toEqual([]);expect(panels(l)[0]).toMatchObject({totalMotors:18,ownerComponentId:'rear'});
});
it.each([
 [{sundance_shade_control:'Simphony 40 6Nm 110V'},'power'],
 [{[SUNDANCE_PANEL_ID_KEY]:'Panel 0'},'id'],
 [{[SUNDANCE_PANEL_ID_KEY]:'Panel 51'},'id'],
 [{sundance_shade_accessory_simphony24_qty:1},'duplicate_supply'],
 [{sundance_shade_accessory_simphony_distribution_qty:1},'duplicate_supply'],
] as const)('blocks invalid panel configuration %j',(configuration,rule)=>{
 const l=line('a',1,configuration);expect(deriveSundanceOrderPower([l]).map(i=>i.ruleId)).toContain(`sundance.order_power.${rule}`);expect(panels(l)).toEqual([]);
});
it('rejects unsupported families, fractional quantity, parent assignment and malformed component records',()=>{
 expect(deriveSundanceOrderPower([line('x',1,{},'sundance_flat_roman')])[0].ruleId).toBe('sundance.order_power.power');
 expect(deriveSundanceOrderPower([line('x',1.5)])[0].ruleId).toBe('sundance.order_power.quantity');
 const {l,a}=assemblyLine();l.selection.configuration={...l.selection.configuration,[SUNDANCE_PANEL_ID_KEY]:'Panel 1'};
 expect(deriveSundanceOrderPower([l]).map(i=>i.ruleId)).toContain('sundance.order_power.parent_connection');
 l.selection.configuration={...l.selection.configuration,[SUNDANCE_PANEL_ID_KEY]:null};a.components[0].productId='sundance_cellular';
 expect(deriveSundanceOrderPower([l])[0].ruleId).toBe('sundance.order_power.component_product');
});
it('keeps separate panels independent and leaves Norman records unchanged',()=>{
 const a=line('a',18),b=line('b',18,{[SUNDANCE_PANEL_ID_KEY]:'Panel 2'}),n=line('norman',1,{norman_order_record_v1:{sourceRetail:22}},'roller');
 const before=JSON.stringify(n);expect(deriveSundanceOrderPower([a,b,n])).toEqual([]);
 expect(panels(a)[0].sourceNetCharge).toBe(800);expect(panels(b)[0].sourceNetCharge).toBe(800);expect(JSON.stringify(n)).toBe(before);
});
it('clears stale power assignment when control changes and keeps derived IDs/net costs out of customer descriptions',()=>{
 const l=line('a');deriveSundanceOrderPower([l]);
 const changed=sundanceShadeConfigurationPatch(l.selection.configuration,'Cordless');
 expect(changed[SUNDANCE_PANEL_ID_KEY]).toBeNull();expect(changed[SUNDANCE_ORDER_POWER_KEY]).toBeNull();
 const details=getQuoteDesignDetails({options_json:{[SUNDANCE_ORDER_POWER_KEY]:l.selection.configuration[SUNDANCE_ORDER_POWER_KEY]}} as unknown as SalesQuoteDesign);
 expect(details).toEqual([]);
});

it('does not derive an undercounted panel when another connected motor is invalid',()=>{
 const a=line('a',18),b=line('b',1,{sundance_shade_accessory_simphony24_qty:1});
 expect(deriveSundanceOrderPower([a,b]).map(i=>i.ruleId)).toContain('sundance.order_power.incomplete_group');expect(panels(a)).toEqual([]);expect(panels(b)).toEqual([]);
 b.selection.configuration={...b.selection.configuration,sundance_shade_accessory_simphony24_qty:0};expect(deriveSundanceOrderPower([a,b])[0].ruleId).toBe('sundance.order_power.capacity');
 a.selection.quantity=17;expect(deriveSundanceOrderPower([a,b])).toEqual([]);expect(panels(a)[0]).toMatchObject({totalMotors:18,sourceNetCharge:800});
});
