import {describe,it,expect} from 'vitest';
import type {SelectionContext,SelectionRecord} from '@/lib/quote-v2/core';
import {validateSelection} from '@/lib/quote-v2/rules';
import {repriceExactQuoteBuilderForServerDate} from '@/lib/quote-lab/exact-backend';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
import {sundanceCatalog} from './catalog';
import {sundanceStockVerticalPatch,SUNDANCE_STOCK_VERTICAL_PROGRAM as programId} from './supplemental-configuration';
import {sundanceStockVerticalEvidence as evidence,validateSundanceStockVerticalConfiguration as validate,STOCK_VERTICAL_SQUARE,STOCK_VERTICAL_WIDTHS} from './stock-vertical-configuration';
const config:SelectionRecord={...sundanceStockVerticalPatch({},true),stock_vertical_color:'Off-White',stock_vertical_valance:'None',stock_vertical_width_cut_down:'No',stock_vertical_height_cut_down:'No',stock_vertical_wand_side:'Left',stock_vertical_draw_side:'Right',stock_vertical_fulfillment:'Pickup in Arcadia'};
const selection=(width=42,height=60,c:SelectionRecord=config):SelectionContext=>({manufacturerId:'sundance',productId:'sundance_vertical_essence',programId,catalogAsOf:'2026-09-20',catalogVersion:'test',widthInches:width,heightInches:height,quantity:2,options:{},configuration:c});
const ids=(s:SelectionContext)=>validate(s).map(i=>i.ruleId.replace('sundance.stock_vertical.',''));
describe('Stock Vertical Essence source and fulfillment',()=>{
 it('retains every published base cell and independent square-valance value without net/retail mixing',()=>{
  const p=sundanceCatalog.products.find(p=>p.id==='sundance_vertical_essence')!.programs.find(p=>p.id===programId)!;
  for(const [wi,w] of p.grid.widths.entries())for(const [hi,h] of p.grid.heights.entries()){
   const s=selection(w,h,{...config,stock_vertical_valance:'Square corner valance'}),e=evidence(s);
   expect(validate(s)).toEqual([]);expect(e.base?.sourceRetail).toBe(p.grid.prices[hi][wi]);expect(e.squareValanceAtRequestedWidth).toBe(STOCK_VERTICAL_SQUARE[wi]);expect(e.netCutSubtotal).toBe(0);expect(e.customerPriceEligible).toBe(false);
  }
  expect(evidence(selection()).base?.sourceRetail).toBe(169);
  expect(evidence(selection(42,60,{...config,stock_vertical_valance:'Square corner valance'})).squareValanceAtRequestedWidth).toBe(49);
 });
 it('prices the explicitly recorded larger blind and charges each requested cut once per blind',()=>{
  const s=selection(42,60,{...config,stock_vertical_width_cut_down:'Yes',stock_vertical_height_cut_down:'Yes',stock_vertical_before_width:45,stock_vertical_before_height:66});
  expect(validate(s)).toEqual([]);expect(evidence(s)).toMatchObject({base:{sourceRetail:185,gridWidth:45,gridHeight:66},netWidthCut:5,netHeightCut:5,netCutSubtotal:10,stockAvailabilityVerified:false});
  expect(evidence(selection(42,60,{...s.configuration,stock_vertical_height_cut_down:'No'}))).toMatchObject({base:{sourceRetail:178,gridHeight:60},netCutSubtotal:5});
 });
 it('does not treat grid breakpoints as evidence of the larger physical blind',()=>{
  for(const before of [undefined,null,42,41.9,NaN,'45'])expect(ids(selection(42,60,{...config,stock_vertical_width_cut_down:'Yes',stock_vertical_before_width:before??null}))).toContain('width_before_cut');
  expect(ids(selection(42,60,{...config,stock_vertical_width_cut_down:'Yes',stock_vertical_before_width:126.0625}))).toContain('base_grid');
  expect(ids(selection(31.9375,60))).toContain('width_lower_cut_limit');expect(ids(selection(42,43.9375))).toContain('height_lower_cut_limit');
  expect(ids(selection(126.0625,60))).toContain('width_range');expect(ids(selection(42,96.0625))).toContain('height_range');
 });
 it('retains the cut-down valance charge-scope exception while exposing the exact schedule',()=>{
  const s=selection(42,60,{...config,stock_vertical_width_cut_down:'Yes',stock_vertical_before_width:45,stock_vertical_valance:'Square corner valance'});
  expect(ids(s)).toEqual(['valance_cut_scope']);expect(evidence(s)).toMatchObject({base:{sourceRetail:178},squareValanceAtRequestedWidth:49,netCutSubtotal:5});
  for(let i=1;i<STOCK_VERTICAL_WIDTHS.length;i++)expect(evidence(selection(STOCK_VERTICAL_WIDTHS[i-1]+.0625,60,{...config,stock_vertical_valance:'Square corner valance'})).squareValanceAtRequestedWidth).toBe(STOCK_VERTICAL_SQUARE[i]);
 });
 it('enforces pickup, source colors, one-way draw, wand and program identity at the shared validation boundary',()=>{
  const s=selection(42,60,{...config,stock_vertical_fulfillment:'Delivery',stock_vertical_color:'Black',stock_vertical_draw:'Split',stock_vertical_wand_side:null});
  expect(ids(s)).toEqual(expect.arrayContaining(['pickup','color','construction','sides']));
  expect(validateSelection(s).filter(i=>i.ruleId.startsWith('sundance.stock_vertical.')).map(i=>i.ruleId)).toContain('sundance.stock_vertical.pickup');
  expect(ids({...s,programId:'custom'})).toContain('identity');
  expect(validate({...s,programId:'custom',configuration:{sundance_vertical_type:'Custom'}})).toEqual([]);
 });
 it('preserves new scalar measurements through serialization and clears them when changing offerings',()=>{
  const s=selection(42,60,{...config,stock_vertical_width_cut_down:'Yes',stock_vertical_before_width:45});
  const saved=JSON.parse(JSON.stringify(s));expect(validate(saved)).toEqual([]);expect(evidence(saved)).toEqual(evidence(s));
  expect(sundanceStockVerticalPatch(saved.configuration,false)).toMatchObject({stock_vertical_before_width:null,stock_vertical_before_height:null,stock_vertical_fulfillment:null,stock_vertical_wand_side:null,stock_vertical_draw_side:null});
 });
 it('preserves measured cut dimensions and pickup through the real server adapter while retaining the customer-price hold',()=>{
  const line={id:'stock',quote_id:'internal',room_name:'Office',product_type:'Vertical Blinds',width_whole:42,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:2,sort_order:0,created_at:'2026-09-20T00:00:00Z'} as SalesQuoteLineItem;
  const design={id:'stock-A',line_item_id:'stock',variant:'A',product_type:'Vertical Blinds',supplier:'Sundance',unit_price:0,options_json:{...config,stock_vertical_width_cut_down:'Yes',stock_vertical_before_width:45,quote_v2_backend:true,quote_lab_product_id:'sundance_vertical_essence',quote_lab_program_id:programId}} as unknown as SalesQuoteDesign;
  const input=JSON.parse(JSON.stringify({lines:[line],designs:[design],selectedVariantByLine:{stock:'A'}}));
  const saved=repriceExactQuoteBuilderForServerDate(input,'2026-09-20');
  if(!('backend'in saved)||saved.backend!=='v2')throw Error('Expected authoritative V2');
  const priced=saved.designs[0];
  expect(priced.selection.configuration).toMatchObject({stock_vertical_before_width:45,stock_vertical_fulfillment:'Pickup in Arcadia',stock_vertical_wand_side:'Left',stock_vertical_draw_side:'Right'});
  expect(priced.result.ok).toBe(false);expect(priced.result.validationIssues.filter(i=>i.ruleId.startsWith('sundance.stock_vertical.'))).toEqual([]);
  input.designs[0].options_json.stock_vertical_before_width=42;
  input.designs[0].options_json.stock_vertical_fulfillment='Delivery';
  const blocked=repriceExactQuoteBuilderForServerDate(input,'2026-09-20');
  if(!('backend'in blocked)||blocked.backend!=='v2')throw Error('Expected authoritative V2');
  expect(blocked.designs[0].result.validationIssues.map(i=>i.ruleId)).toEqual(expect.arrayContaining(['sundance.stock_vertical.width_before_cut','sundance.stock_vertical.pickup']));
 });
});
