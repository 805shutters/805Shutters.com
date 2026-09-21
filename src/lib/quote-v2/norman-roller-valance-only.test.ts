import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ROLLER_VALANCE_ONLY as ONLY,ROLLER_SEPARATE_VALANCE as SEPARATE,ROLLER_VALANCE_KEY as KEY,ROLLER_VALANCE_DERIVED as DERIVED,ROLLER_VALANCE_STYLES,ROLLER_FASCIA_COLORS,ROLLER_CAP_COLORS,isRollerValanceAssociationType,rollerValanceProducts,emptyRollerValance,parseRollerValance,newRollerValanceDraft,syncRollerValanceDraft,rollerValanceDirty,type RollerValanceRecord} from '../quote/norman-roller-valance-only';
import {validateRollerValance,deriveRollerSeparateValances,hasRollerValanceUnits} from './norman-roller-valance-only';
import {quoteV2CatalogVersionFor} from './catalog';
import {normanRollerFabricColors} from '../quote/norman-roller-fabrics';
import {getProduct} from '../quote/catalog';
import {validateSelection} from './rules';
import {repriceExactQuoteBuilderForServerDate} from '../quote-lab/exact-backend';
import {resolveManufacturerOptionsUiRoute} from '@mts/components/crm/quote-builder/DesignCard';
import {NormanRollerValanceOptions} from '@/components/crm/NormanRollerValanceOptions';
import {quoteQuantityLabel} from '../quote/quantity-label';
import {customerConfigurationFromSelection,v2CustomerConfigurationOptions} from '../crm/sales-quote-v2-customer-configuration';
import type {SelectionContext} from './core';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
const record=():RollerValanceRecord=>({...emptyRollerValance(),style:'4.5-inch Square Fascia',width:190,mount:'Outside',fasciaColor:'White',returnLength:3});
const selection=(id=ONLY,r=record()):SelectionContext=>({productId:id,manufacturerId:'Norman',programId:`${id}_source`,catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor(id,'2026-09-20'),widthInches:0,heightInches:0,quantity:1,options:{},configuration:{[KEY]:r}});
const errors=(r=record())=>validateRollerValance(selection(ONLY,r)).map(i=>i.ruleId.split('.').at(-1));
const shade=(lineId:string,patch:Record<string,unknown>={},width=30)=>({lineId,selection:{...selection(),productId:'roller',programId:'roller_cordless_fabric_price_group_1',catalogVersion:quoteV2CatalogVersionFor('roller','2026-09-20'),widthInches:width,heightInches:60,configuration:{lift_system:'PrecisionLift Cordless',mount_type:'Outside',roller_application:'Single',valance:'None',roller_tube:'Large',roller_hardware_v1:{version:1,installation:'Back / Wall Mount',shimLayers:0,raceway:true},...patch}}});
const group=(r:Partial<RollerValanceRecord>={})=>({lineId:'v',selection:selection(SEPARATE,{...record(),associatedLineIds:['a','b'],...r})});
describe('Roller Valance Only and Separate Valance source destinations',()=>{
 it('keeps original shade IDs and adds two exact held destinations',()=>{
  for(const p of rollerValanceProducts){expect(getProduct(p.id)).toEqual(p);expect(p.programs[0].grid.prices).toEqual([]);expect(p.customerRetailStatus).toBe('unverified');}
  expect(getProduct('roller')!.programs.length).toBeGreaterThan(1);
  for(const style of ['3.5-inch Square Fascia','3.5-inch Curved Fascia Plain','3.5-inch Fabric Valance','Modern Wood Valance','Cassette'])expect(errors({...record(),style})).toContain('style');
  for(const color of ROLLER_FASCIA_COLORS)expect(errors({...record(),fasciaColor:color})).toEqual(['price_approval']);
  for(const color of ROLLER_CAP_COLORS)expect(errors({...record(),style:'4.5-inch Curved Fascia with Fabric',fabricCode:'F1484',fasciaColor:'',endCapColor:color})).toEqual(['price_approval']);
  for(const style of ROLLER_VALANCE_STYLES)expect(errors({...record(),style})).not.toContain('style');
 });
 it('routes every currently available exact Roller fabric code and rejects unknown identities',()=>{
  const colors=normanRollerFabricColors.filter(c=>c.available);expect(colors.length).toBeGreaterThan(400);
  for(const c of colors)expect(errors({...record(),style:'8-inch Fabric Valance',fabricCode:c.colorCode,fasciaColor:''})).toEqual(['price_approval']);
  expect(errors({...record(),style:'6-inch Fabric Valance',fabricCode:'F0000',fasciaColor:''})).toContain('fabric');
  expect(errors({...record(),style:'6-inch Fabric Valance',fabricCode:'F1561',fasciaColor:''})).toContain('fabric');
 });
 it('enforces minimum, explicit returns, required colors and95-inch sections',()=>{
  expect(errors({...record(),width:7.999})).toContain('width');expect(errors({...record(),width:8})).toEqual(['price_approval']);
  expect(errors({...record(),returnLength:null})).toContain('return_length');expect(errors({...record(),fasciaColor:''})).toContain('fascia_color');
  for(const [width,pieces] of [[95,[95]],[95.01,[47.505,47.505]],[190,[95,95]]]){const s=selection(ONLY,{...record(),width:width as number});validateRollerValance(s);expect(s.configuration[DERIVED]).toMatchObject({pieceLengths:pieces,raceway:false,valanceBracketSize:'large'});}
 });
 it('supports up to5keystones with exact18inch boundary and noAtGaps interpretation',()=>{
  const r={...record(),width:570,joinery:'Keystone' as const,keystoneShape:'V-Shape' as const,keystoneCount:5};expect(errors(r)).toEqual(['price_approval']);
  expect(errors({...r,keystoneCount:6})).toContain('keystone_count');
  const custom={...r,width:113,keystoneCount:1,layout:'Custom' as const,locations:[18]};expect(errors(custom)).toEqual(['price_approval']);
  expect(errors({...custom,locations:[17.99]})).toContain('spacing');expect(errors({...custom,width:113.01})).toContain('piece_length');
  expect(parseRollerValance({...r,layout:'At Gaps'})).toBeNull();expect(parseRollerValance({...r,version:2})).toBeNull();
 });
 it('derives associations only from selected shades, allows mixed lifts, stores recommended widths without hard blocking',()=>{
  const v=group({width:100,controlClearanceConfirmed:true}),a=shade('a'),b=shade('b',{lift_system:'Continuous Cord Loop'});
  expect(deriveRollerSeparateValances([v,a,b]).map(i=>i.ruleId.split('.').at(-1))).toEqual(['tube_identity','tube_identity','hardware_matching']);
  expect(v.selection.configuration[DERIVED]).toMatchObject({associatedLineIds:['a','b'],associatedLiftSystems:['PrecisionLift Cordless','Continuous Cord Loop'],recommendedMinimumWidth:60.25,recommendedMaximumWidth:72,recommendedWidthStatus:'outside_recommended_range'});
  expect(validateRollerValance(v.selection).map(i=>i.ruleId.split('.').at(-1))).toEqual(['price_approval']);
  expect(deriveRollerSeparateValances([group(),a]).some(i=>i.ruleId.endsWith('members'))).toBe(true);
  expect(deriveRollerSeparateValances([group({associatedLineIds:['a','a']}),a]).some(i=>i.ruleId.endsWith('members'))).toBe(true);
 });
 it('rejects mismatchedmount, missingraceway, Single/Dual mix, narrowcordlessupgrade and missing control clearance',()=>{
  const run=(patch:Record<string,unknown>,width=30)=>deriveRollerSeparateValances([group(),shade('a'),shade('b',patch,width)]).map(i=>i.ruleId.split('.').at(-1));
  expect(run({mount_type:'Inside'})).toContain('mount_matching');expect(run({roller_hardware_v1:{version:1,installation:'Back / Wall Mount',shimLayers:0,raceway:false}})).toContain('raceway');
  expect(run({roller_application:'Dual'})).toContain('single_dual');expect(run({roller_application:'Dual'})).toContain('dual_valance');
  expect(run({roller_tube:'Standard'},20)).toContain('cordless_upgrade');expect(run({lift_system:'SmartRelease'})).toContain('control_clearance');
  const v=group(),v2={...group(),lineId:'v2'};expect(deriveRollerSeparateValances([v,v2,shade('a'),shade('b')]).filter(i=>i.ruleId.endsWith('duplicate_membership'))).toHaveLength(4);
 });
 it('requires typed naturalunit identity and retains preintroduction protection',()=>{
  expect(hasRollerValanceUnits(ONLY,{[KEY]:record()})).toBe(true);expect(hasRollerValanceUnits('roller',{[KEY]:record()})).toBe(false);
  expect(validateSelection(selection()).some(i=>i.ruleId.startsWith('common.dimension'))).toBe(false);
  expect(validateRollerValance({...selection(),catalogAsOf:'2026-09-19'}).some(i=>i.ruleId.endsWith('effective_date'))).toBe(true);
  expect(errors({...record(),associatedLineIds:['a']})).toContain('association');
 });
 it('retains rapid field edits atomically across stale acknowledgements',()=>{
  const blank=emptyRollerValance();let s=newRollerValanceDraft('d',blank);
  for(const patch of [{style:record().style},{width:190},{fasciaColor:'Bianca'},{returnLength:3}])s={...s,record:{...s.record,...patch}};
  s=syncRollerValanceDraft(s,'d',blank);const sent=s.record;s={...s,submitted:sent};s=syncRollerValanceDraft(s,'d',blank);
  expect(s.record).toEqual(sent);s={...s,record:{...s.record,width:191}};s=syncRollerValanceDraft(s,'d',sent);expect(s.record.width).toBe(191);expect(rollerValanceDirty(s)).toBe(true);
 });
 it.each([ONLY,SEPARATE])('real backend saves %s naturalunits, strips forged derivedpricing, remains held',id=>{
  const r=record(),options={quote_v2_backend:true,catalog_product_id:id,quote_lab_product_id:id,catalog_program_id:`${id}_source`,quote_lab_program_id:`${id}_source`,manual_price_override:999,[KEY]:r,[DERIVED]:{pricingStatus:'approved',pieceLengths:[1]}},design={id:'d',line_item_id:'l',variant:'A',supplier:'Norman',options_json:options} as unknown as SalesQuoteDesign;
  const input={lines:[{id:'l',quote_id:'audit',room_name:'Roller Valance',product_type:'Valances',width_whole:0,width_fraction:'0',height_whole:0,height_fraction:'0',quantity:2,sort_order:0} as SalesQuoteLineItem],designs:[design],selectedVariantByLine:{l:'A'}};
  expect(resolveManufacturerOptionsUiRoute(design,'Valances',options)).toMatchObject({status:'supported',productId:id});
  const result=repriceExactQuoteBuilderForServerDate(input,'2026-09-20');if(!('backend'in result)||result.backend!=='v2')throw Error('V2 required');
  const row=result.designs[0];expect(row.selection).toMatchObject({productId:id,widthInches:0,heightInches:0,quantity:2,configuration:{[KEY]:r}});expect(row.result.ok).toBe(false);expect(row.snapshot).toBeNull();
  expect(row.selection.configuration).not.toHaveProperty('manual_price_override');expect(row.selection.configuration[DERIVED]).toMatchObject({pieceLengths:[95,95],pricingStatus:'standalone_separate_price_unverified'});
  expect(repriceExactQuoteBuilderForServerDate(JSON.parse(JSON.stringify(input)),'2026-09-20')).toEqual(result);expect(quoteQuantityLabel(2,options)).toBe('2 valances');
  const output=v2CustomerConfigurationOptions(customerConfigurationFromSelection(row.selection)).join(' ');expect(output).toContain('Valance end-to-end width in inches: 190');expect(output).not.toMatch(/source_v1|associatedLineIds/);
  const html=renderToStaticMarkup(createElement(NormanRollerValanceOptions,{design,productId:id,lineOptions:[],onUpdateFields:()=>{}}));expect(html).toContain('Save Roller valance');expect(html).not.toContain('Add Size');
 });
});

it('lists exact Roller fabric identity for a separate valance without accepting conflicting products',()=>{
 expect(isRollerValanceAssociationType('Valances','Roller Shades')).toBe(true);expect(isRollerValanceAssociationType('Valances','Roman Shades')).toBe(false);expect(isRollerValanceAssociationType('Roman Shades','Roller Shades')).toBe(false);
 const make=(id:string,options:Record<string,unknown>)=>({lineId:id,label:`Shade ${id}`,design:{supplier:'Norman',options_json:options} as SalesQuoteDesign});
 const html=renderToStaticMarkup(createElement(NormanRollerValanceOptions,{design:undefined,productId:SEPARATE,lineOptions:[make('fabric',{fabric_product_id:'roller'}),make('catalog',{catalog_product_id:'roller'}),make('conflict',{fabric_product_id:'roman',catalog_product_id:'roller'})],onUpdateFields:()=>{}}));
 expect(html).toContain('Shade fabric');expect(html).toContain('Shade catalog');expect(html).not.toContain('Shade conflict');expect(html).not.toContain('Add the associated Norman Roller shades');
});
