import { describe,it,expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getProduct } from './catalog';
import { onyxHeldProducts,onyxHeldColors,ONYX_HELD_VERSION } from './onyx-held-catalog';
import { priceDesign,priceDealerNetDesign } from './pricing';
import { validateOnyxHeldSelection } from '../quote-v2/onyx-held-rules';
import { priceQuoteV2Selection } from '../quote-v2/engine';
import { selectionContextFromExactInterface } from '../quote-v2/exact-interface-adapter';
import { quoteLabProductType } from '../quote-lab/builder';
import { getMtsProductColorRows } from '@mts/lib/productColorCatalog';
import { resolveManufacturerOptionsUiRoute } from '@mts/components/crm/quote-builder/DesignCard';
import { OnyxHeldDesignOptions } from '@/components/crm/OnyxHeldDesignOptions';
import type { SalesQuoteLineItem,SalesQuoteDesign } from '@mts/types/quote';

const line=(productId:string)=>({id:'audit',quote_id:'audit',room_name:'Internal',product_type:quoteLabProductType(productId)!,width_whole:30,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} satisfies SalesQuoteLineItem);
const designFor=(row:typeof onyxHeldColors[number])=>({supplier:'Onyx',fabric:row.collection,options_json:{quote_v2_backend:true,catalog_product_id:row.productId,catalog_program_id:row.programId,fabric_product_id:row.productId,fabric_color_id:row.id,fabric_color_code:row.colorCode,fabric_color_name:row.colorName,fabric_color_collection:row.collection}} satisfies Partial<SalesQuoteDesign>);

describe('Onyx documented destinations with explicit price holds',()=>{
  it('accounts for all 703 shade colors and31 Ash finishes without altering legacy identities',()=>{
    expect(onyxHeldProducts).toHaveLength(8);
    expect(onyxHeldProducts.reduce((n,p)=>n+p.programs.length,0)).toBe(52);
    expect(onyxHeldColors).toHaveLength(734);
    expect(new Set(onyxHeldColors.map(c=>c.id)).size).toBe(734);
    expect(getProduct('onyx_shutters')?.programs.find(p=>p.id==='poly_composite')?.pricePerSqft).toBe(31);
    for(const p of onyxHeldProducts){expect(getProduct(p.id)).toBe(p);expect(quoteLabProductType(p.id)).toBe(p.productType);}
  });
  it('every source color survives saved JSON and the server adapter with its exact program',()=>{
    for(const row of onyxHeldColors){
      const saved=JSON.parse(JSON.stringify(designFor(row)));
      const context=selectionContextFromExactInterface(line(row.productId),saved,{productId:row.productId,programId:row.programId!,catalogAsOf:'2026-09-20'});
      expect(context.catalogVersion).toBe(ONYX_HELD_VERSION);
      expect(validateOnyxHeldSelection(context).map(x=>x.ruleId)).toEqual(['onyx.current.price_grid_required']);
    }
  });
  it('rejects crossed product, collection and color identities and unlisted controls',()=>{
    const row=onyxHeldColors[0];
    const s=selectionContextFromExactInterface(line(row.productId),designFor(row),{productId:row.productId,programId:row.programId!,catalogAsOf:'2026-09-20'});
    const patches: Record<string,string>[] = [{fabric_color_code:'forged'},{fabric_color_collection:'wrong'},{fabric_color_name:'wrong'}];
    for(const patch of patches)expect(validateOnyxHeldSelection({...s,configuration:{...s.configuration,...patch}}).some(x=>x.ruleId==='onyx.current.color_program')).toBe(true);
    expect(validateOnyxHeldSelection({...s,configuration:{...s.configuration,lift_system:'Norman SmartFit'}}).some(x=>x.ruleId==='onyx.current.control')).toBe(true);
  });
  it('never prices arbitrary dimensions from the sample fixtures or a client price',()=>{
    for(const p of onyxHeldProducts){
      const row=onyxHeldColors.find(c=>c.productId===p.id)!;
      const priceInput={productId:p.id,programId:row.programId!,widthInches:30,heightInches:60};
      expect(priceDesign(priceInput)).toMatchObject({ok:false,code:'MANUAL_PRICE_REQUIRED'});
      expect(priceDealerNetDesign(priceInput)).toMatchObject({ok:false,code:'MANUAL_PRICE_REQUIRED'});
      const selection=selectionContextFromExactInterface(line(p.id),{...designFor(row),unit_price:999},{productId:p.id,programId:row.programId!,catalogAsOf:'2026-09-20'});
      expect(priceQuoteV2Selection({selection,priceInput})).toMatchObject({ok:false,code:'MANUAL_PRICE_REQUIRED',validationStatus:'blocked',pricedSelectionFingerprint:null});
    }
  });
  it('routes exact products to dedicated source choices instead of a Norman fallback',()=>{
    for(const p of onyxHeldProducts){
      const row=onyxHeldColors.find(c=>c.productId===p.id)!;const d=designFor(row) as unknown as SalesQuoteDesign;
      expect(resolveManufacturerOptionsUiRoute(d,p.productType,d.options_json!)).toMatchObject({status:'supported',productId:p.id,manufacturer:'Onyx'});
      expect(getMtsProductColorRows(p.productType,d.options_json!)).toEqual(onyxHeldColors.filter(c=>c.productId===p.id));
      const html=renderToStaticMarkup(createElement(OnyxHeldDesignOptions,{design:d,productId:p.id,onUpdateFields:()=>{}}));
      expect(html).toContain('Onyx color');expect(html).toContain(row.colorCode);expect(html).toContain('internal draft');
    }
  });
});
