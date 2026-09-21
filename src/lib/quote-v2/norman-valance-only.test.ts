import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ULTIMATE_VALANCE as U, SMARTPRIVACY_VALANCE as SP, VALANCE_ONLY_KEY as KEY, valanceOnlyProducts, emptyValanceOnly, parseValanceOnly, newValanceDraft, syncValanceDraft, valanceDraftDirty, type ValanceOnlyRecord } from '../quote/norman-valance-only';
import { validateValanceOnly, hasValanceOnlyUnits } from './norman-valance-only';
import { productColorOptions } from '../quote/product-color-options';
import { getProduct } from '../quote/catalog';
import { validateSelection } from './rules';
import { quoteV2CatalogVersionFor } from './catalog';
import { repriceExactQuoteBuilderForServerDate } from '../quote-lab/exact-backend';
import { resolveManufacturerOptionsUiRoute } from '@mts/components/crm/quote-builder/DesignCard';
import { NormanValanceOnlyOptions } from '@/components/crm/NormanValanceOnlyOptions';
import { quoteQuantityLabel } from '../quote/quantity-label';
import { getQuoteDesignDetails } from '@mts/lib/quoteDesignDetails';
import { customerConfigurationFromSelection, v2CustomerConfigurationOptions } from '../crm/sales-quote-v2-customer-configuration';
import type { SelectionContext } from './core';
import type { SalesQuoteLineItem, SalesQuoteDesign } from '@mts/types/quote';

function record(id=U):ValanceOnlyRecord {
  const r=emptyValanceOnly(id),color=productColorOptions.find(c=>c.productId===r.sourceProductId&&c.available)!;
  return {...r,sourceColorId:color.id,style:'3.25-inch Designer Crown',innerLengthInches:192,returns:'None'};
}
function selection(id=U,r=record(id)):SelectionContext {
  return {productId:id,manufacturerId:'Norman',programId:`${id}_source`,catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor(id,'2026-09-20'),widthInches:0,heightInches:0,quantity:2,options:{},configuration:{[KEY]:r}};
}
const errors=(id:string,r:ValanceOnlyRecord)=>validateValanceOnly(selection(id,r)).map(v=>v.ruleId.split('.').at(-1));
describe('Norman standalone valances, source geometry with explicit pricing holds',()=>{
  it('adds two unpriced destinations while preserving existing products and exact finish IDs',()=>{
    for(const product of valanceOnlyProducts){expect(getProduct(product.id)).toEqual(product);expect(product.priceBasis).toBe('manual_required');expect(product.customerRetailStatus).toBe('unverified');expect(product.programs[0].grid.prices).toEqual([]);}
    expect(getProduct('faux_wood')?.programs[0].grid.prices.length).toBeGreaterThan(0);
    for(const [id,count] of [[U,16],[SP,6]] as const){
      const r=record(id),colors=productColorOptions.filter(c=>c.productId===r.sourceProductId&&c.available);
      expect(colors).toHaveLength(count);
      for(const c of colors)expect(errors(id,{...r,sourceColorId:c.id})).toEqual(['price_approval']);
    }
    expect(errors(U,{...record(),sourceColorId:record(SP).sourceColorId})).toContain('color');
    expect(errors(SP,{...record(SP),style:'3-inch Linear'})).toContain('style');
    expect(errors(U,{...record(),style:'3-inch Linear'})).toEqual(['price_approval']);
  });
  it.each([U,SP])('validates inner-length boundaries and derives equal pieces for %s',id=>{
    for(const n of [0,-1,384.001])expect(errors(id,{...record(id),innerLengthInches:n})).toContain('length');
    for(const [length,pieces] of [[96,[96]],[96.125,[48.0625,48.0625]],[192,[96,96]],[384,[96,96,96,96]]] as const){
      const s=selection(id,{...record(id),innerLengthInches:length});
      expect(validateValanceOnly(s).map(v=>v.ruleId)).toEqual(['norman.valance_only.price_approval']);
      expect(s.configuration.norman_valance_only_source_v1).toMatchObject({pieceLengths:pieces,quantity:2});
    }
    for(const n of [.499,5.001])expect(errors(id,{...record(id),returns:'Both',returnLengthInches:n})).toContain('return_length');
    for(const n of [.5,5])expect(errors(id,{...record(id),returns:'Both',returnLengthInches:n})).toEqual(['price_approval']);
    expect(errors(id,{...record(id),returns:'None',returnLengthInches:1})).toContain('return_length');
  });
  it('enforces Ultimate keystone count, source spacing and96-inch section limits',()=>{
    const r={...record(),innerLengthInches:13,joinery:'Keystone' as const,keystoneCount:1};
    expect(errors(U,r)).toEqual(['price_approval']);
    expect(errors(U,{...r,innerLengthInches:12.99})).toContain('keystone_minimum');
    expect(errors(U,{...r,keystoneCount:4})).toContain('keystone_count');
    const two={...r,innerLengthInches:31,keystoneCount:2,layout:'Custom' as const,keystoneLocations:[6.5,24.5]};
    expect(errors(U,two)).toEqual(['price_approval']);
    expect(errors(U,{...two,keystoneLocations:[6.49,24.5]})).toContain('keystone_spacing');
    expect(errors(U,{...two,keystoneLocations:[6.5,24.49]})).toContain('keystone_spacing');
    expect(errors(U,{...r,innerLengthInches:384,keystoneCount:3})).toEqual(['price_approval']);
    expect(errors(U,{...r,innerLengthInches:384,keystoneCount:2})).toContain('piece_length');
    expect(errors(U,{...r,innerLengthInches:200,keystoneCount:2,layout:'Custom',keystoneLocations:[50,146]})).toEqual(['price_approval']);
    expect(errors(U,{...r,innerLengthInches:200,keystoneCount:2,layout:'Custom',keystoneLocations:[50,147]})).toContain('piece_length');
    expect(errors(U,{...r,layout:'Custom',keystoneLocations:[null]})).toContain('keystone_locations');
  });
  it('rejects SmartPrivacy custom splits, keystones, single returns and forged records',()=>{
    expect(errors(SP,{...record(SP),joinery:'Keystone',keystoneCount:1})).toContain('smartprivacy_joinery');
    expect(errors(SP,{...record(SP),layout:'Custom',keystoneLocations:[50]})).toContain('smartprivacy_joinery');
    expect(errors(SP,{...record(SP),returns:'Left',returnLengthInches:1})).toContain('returns');
    expect(parseValanceOnly({...record(),version:2})).toBeNull();
    expect(parseValanceOnly({...record(),innerLengthInches:'192'})).toBeNull();
    expect(parseValanceOnly({...record(),keystoneLocations:[1,2,3,4]})).toBeNull();
    expect(errors(SP,record())).toContain('record');
    expect(hasValanceOnlyUnits('faux_wood',{[KEY]:record()})).toBe(false);
    expect(hasValanceOnlyUnits(SP,{[KEY]:record()})).toBe(false);
    expect(validateSelection(selection()).some(v=>v.ruleId.startsWith('common.dimension'))).toBe(false);
    expect(validateSelection({...selection(),productId:'faux_wood'}).some(v=>v.ruleId.startsWith('common.dimension'))).toBe(true);
    expect(validateValanceOnly({...selection(),widthInches:36}).some(v=>v.ruleId.endsWith('natural_units'))).toBe(true);
    expect(validateValanceOnly({...selection(),catalogAsOf:'2026-09-19'}).some(v=>v.ruleId.endsWith('effective_date'))).toBe(true);
  });
  it('saves rapid edits atomically and keeps later local edits across stale acknowledgements',()=>{
    const blank=emptyValanceOnly(U);let s=newValanceDraft('d',blank);
    for(const patch of [{sourceColorId:record().sourceColorId},{style:'3-inch Linear'},{innerLengthInches:384},{returns:'Both' as const},{returnLengthInches:1},{joinery:'Keystone' as const,keystoneCount:3}])s={...s,record:{...s.record,...patch}};
    s=syncValanceDraft(s,'d',blank);const sent=s.record;expect(valanceDraftDirty(s)).toBe(true);s={...s,submitted:sent};
    s=syncValanceDraft(s,'d',blank);expect(s.record).toEqual(sent);
    s={...s,record:{...s.record,returnLengthInches:2}};s=syncValanceDraft(s,'d',sent);
    expect(s.record.returnLengthInches).toBe(2);expect(valanceDraftDirty(s)).toBe(true);
    expect(parseValanceOnly(JSON.parse(JSON.stringify(sent)))).toEqual(sent);
  });
  it.each([U,SP])('persists natural units through real backend and keeps customer delivery held: %s',id=>{
    const r=record(id),s=selection(id,r),productType='Valances';
    const options={quote_v2_backend:true,catalog_product_id:id,quote_lab_product_id:id,catalog_program_id:s.programId,quote_lab_program_id:s.programId,manual_price_override:999,authoritative_price_status:"priced",norman_valance_only_source_v1:{pieceLengths:[1],pricingStatus:"approved"},[KEY]:r};
    const design={id:'d',line_item_id:'l',variant:'A',supplier:'Norman',options_json:options} as unknown as SalesQuoteDesign;
    expect(resolveManufacturerOptionsUiRoute(design,productType,options)).toMatchObject({status:'supported',productId:id});
    const input={lines:[{id:'l',quote_id:'audit',room_name:'Valance Audit',product_type:productType,width_whole:0,width_fraction:'0',height_whole:0,height_fraction:'0',quantity:2,sort_order:0} as SalesQuoteLineItem],designs:[design],selectedVariantByLine:{l:'A'}};
    const result=repriceExactQuoteBuilderForServerDate(input,'2026-09-20');
    if(!('backend'in result)||result.backend!=='v2')throw Error('Expected V2');
    expect(result.designs[0].selection).toMatchObject({productId:id,widthInches:0,heightInches:0,quantity:2,configuration:{[KEY]:r}});
    expect(result.designs[0].result).toMatchObject({ok:false,productStatus:'manual_quote_required'});
    expect(result.designs[0].snapshot).toBeNull();
    expect(result.designs[0].selection.configuration.norman_valance_only_source_v1).toMatchObject({pieceLengths:[96,96],pricingStatus:'standalone_price_unverified'});
    expect(result.designs[0].selection.configuration).not.toHaveProperty('manual_price_override');
    expect(repriceExactQuoteBuilderForServerDate(JSON.parse(JSON.stringify(input)),'2026-09-20')).toEqual(result);
    expect(quoteQuantityLabel(2,options)).toBe('2 valances');
    const output=v2CustomerConfigurationOptions(customerConfigurationFromSelection(result.designs[0].selection)).join(' ');
    expect(output).toContain('Valance inner length in inches: 192');expect(output).not.toMatch(/sourceColorId|source_v1|price|cost/i);
    expect(getQuoteDesignDetails({...design,options_json:result.designs[0].selection.configuration} as SalesQuoteDesign).map(d=>d.label).join(' ')).not.toMatch(/Only V1|Source V1/);
    const html=renderToStaticMarkup(createElement(NormanValanceOnlyOptions,{design,productId:id,onUpdateFields:()=>{}}));
    expect(html).toContain('Standalone valance inner length');expect(html).toContain('Save standalone valance');expect(html).not.toContain('Add Size');
  });
});
