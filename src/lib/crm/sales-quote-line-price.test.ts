import { describe,it,expect } from 'vitest';
import { parseLinePriceBody } from './sales-quote-line-price';
import { resolveQuoteDisplayTotal,shouldPersistQuoteDesignSubtotal } from '@mts/lib/quoteTotals';
const body={lineItemId:'10000000-0000-4000-8000-000000000001',requestId:'10000000-0000-4000-8000-000000000002',variant:'A',unitPrice:0};
describe('staff line price input',()=>{
 it.each([0,0.01,1.25,15000.99])('accepts an arbitrary valid price %s',unitPrice=>expect(parseLinePriceBody({...body,unitPrice}).unitPrice).toBe(unitPrice));
 it.each(['',null,-1,Infinity,NaN])('rejects invalid price %s',unitPrice=>expect(()=>parseLinePriceBody({...body,unitPrice})).toThrow());
 it('rounds cents and refuses client cost metadata',()=>{expect(parseLinePriceBody({...body,unitPrice:1.005}).unitPrice).toBe(1.01);expect(()=>parseLinePriceBody({...body,manufacturerCost:10})).toThrow();});
 it('keeps a deliberate free line instead of restoring an old quote total',()=>{
 const designs=[{line_item_id:'line',unit_price:0,options_json:{manual_price_override:true}}];
 expect(shouldPersistQuoteDesignSubtotal(designs)).toBe(true);
 expect(resolveQuoteDisplayTotal(450,[{id:'line',quantity:2}],designs)).toBe(0);
 });
});
