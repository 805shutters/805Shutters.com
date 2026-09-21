import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSalesQuoteRevision, parseQuoteRevisionBody } from './sales-quote-revisions';
const quoteId = '11111111-1111-4111-8111-111111111111';
const lineItemId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const input = { action: 'manual-price', lineItemId, requestId, expectedRevision: 7, variant: 'A', unitPrice: 0 };
describe('finalized quote revisions', () => {
 it('accepts explicit zero and normalizes a manual merchandise price to cents', () => {
  expect(parseQuoteRevisionBody(input)).toEqual(input);
  expect(parseQuoteRevisionBody({ ...input, unitPrice: 125.125, variant: ' B ' })).toMatchObject({unitPrice:125.13,variant:'B'});
  expect(parseQuoteRevisionBody({action:'delete',lineItemId,requestId,expectedRevision:null})).toMatchObject({action:'delete',expectedRevision:null});
 });
 it.each([null,{}, {...input,amount:0}, {...input,quote:{status:'draft'}}, {...input,requestId:'retry'}, {...input,lineItemId:'other'}, {...input,unitPrice:-1}, {...input,unitPrice:Infinity}, {...input,unitPrice:'0'}, {...input,variant:''}, {...input,expectedRevision:1.5}, {...input,action:'delete'}])('rejects malformed or injected revision data %#', body => expect(()=>parseQuoteRevisionBody(body)).toThrow());
 it('passes only authenticated actor and validated action fields to the one atomic RPC', async () => {
  const result={quoteId:'new',lineItemId:'new-line',revision:2,total:39};
  const rpc=vi.fn().mockResolvedValue({data:result,error:null});
  expect(await createSalesQuoteRevision({rpc} as unknown as SupabaseClient,'authenticated-actor',quoteId,parseQuoteRevisionBody(input))).toEqual(result);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('create_sales_quote_revision',{p_source_id:quoteId,p_actor_id:'authenticated-actor',p_request_id:requestId,p_expected_revision:7,p_action:'manual-price',p_line_item_id:lineItemId,p_variant:'A',p_unit_price:0});
 });
 it('preserves atomic database rejection rather than returning a partial revision', async () => {
  const rpc=vi.fn().mockResolvedValue({data:null,error:{code:'42501',message:'Not authorized'}});
  await expect(createSalesQuoteRevision({rpc} as unknown as SupabaseClient,'actor',quoteId,parseQuoteRevisionBody(input))).rejects.toMatchObject({status:403,message:'Not authorized'});
 });
});
