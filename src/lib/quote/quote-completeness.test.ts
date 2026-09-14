import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { incompleteQuoteLineIds, shouldCheckQuoteCompleteness } from './quote-completeness';
import { QUOTE_V2_SELECTED_DESIGN_MARKER as selected, projectPersistedDesignSelections } from '@/lib/quote-v2/selected-design';
import { FloatingQuoteTotalBadge as current } from '@/mts-quote/components/crm/quote-builder/FloatingQuoteTotalBadge';
import { FloatingQuoteTotalBadge as legacy } from '@/mts-quote-v1/components/crm/quote-builder/FloatingQuoteTotalBadge';
import { calculateQuoteDesignSubtotal as v1Subtotal, resolveQuoteDisplayTotal as v1Display } from '@/mts-quote-v1/lib/quoteTotals';
const lines=[{id:'line',quantity:2,selected_design_id:'b'}];
const rows=[{id:'a',line_item_id:'line',variant:'A',unit_price:100},{id:'b',line_item_id:'line',variant:'B',unit_price:139}];
const projected=projectPersistedDesignSelections(rows as any,lines);
it('loads a persisted alternative and bills only that alternative in V1',()=>{
 expect(v1Subtotal(lines,projected)).toBe(278);
 expect(v1Subtotal(lines,rows)).toBe(478); // Untouched history without a persisted selection.
});
it('checks new and edited drafts while preserving historical opens and sent records',()=>{
 expect(shouldCheckQuoteCompleteness({status:'draft',total_amount:478},rows)).toBe(false);
 expect(shouldCheckQuoteCompleteness({status:'draft',total_amount:478},projected)).toBe(true);
 expect(shouldCheckQuoteCompleteness({status:'draft',total_amount:0},[])).toBe(true);
 expect(shouldCheckQuoteCompleteness({status:'sent',total_amount:478},projected,true)).toBe(false);
 expect(shouldCheckQuoteCompleteness({status:'draft',sent_at:'2026-01-01',total_amount:478},projected,true)).toBe(false);
});
it('detects invalid selected calculated prices, ignores alternatives, and accepts explicit manual zero',()=>{
 const invalid=[{...rows[0],options_json:{pricing_block_reason:'Outside grid'}},{...rows[1],[selected]:true}];
 expect(incompleteQuoteLineIds(lines,invalid)).toEqual([]);
 expect(incompleteQuoteLineIds(lines,[{...invalid[0],[selected]:true},rows[1]])).toEqual(['line']);
 expect(incompleteQuoteLineIds(lines,[])).toEqual(['line']);
 const manual=[{...rows[1],unit_price:0,[selected]:true,options_json:{manual_price_override:true,pricing_block_reason:'Historical error'}}];
 expect(incompleteQuoteLineIds(lines,manual,true)).toEqual([]);
 expect(v1Display(478,lines,manual)).toBe(0);
});
for (const [name,Badge] of [['current',current],['V1',legacy]] as const) describe(`${name} displayed draft total`,()=>{
 const render=(designs:any[],extra={})=>renderToStaticMarkup(React.createElement(Badge,{lineItems:lines,designs,storedTotal:999,checkPricingCompleteness:true,...extra}));
 it('shows incomplete instead of a stale total for an invalid selected line',()=>{
  const html=render([{...rows[1],unit_price:0,[selected]:true,options_json:{pricing_block_reason:'Invalid grid'}}]);
  expect(html).toContain('Pricing incomplete');expect(html).not.toContain('$999');expect(html).not.toContain('Contract Total');
 });
 it('shows a selected valid price and preserves manual zero and historical locks',()=>{
  expect(render(projected)).toContain('Contract Total $278.00');
  expect(render([{...rows[1],[selected]:true,unit_price:0,options_json:{manual_price_override:true}}])).toContain('Contract Total $0.00');
  expect(render([],{useHistoricalTotal:true,historicalTotal:999})).toContain('Original Contract Total $999.00');
 });
});

it('preserves isolated adapter selection evidence while explicit null stays unselected',()=>{
 const marked=rows.map(d=>({...d,[selected]:d.id==='b'}));
 expect(v1Subtotal(lines,projectPersistedDesignSelections(marked as any,[{id:'line'}]))).toBe(278);
 expect(projectPersistedDesignSelections(marked as any,[{id:'line',selected_design_id:null}]).some(d=>d[selected])).toBe(false);
});
