// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { SendQuoteDialog } from './SendQuoteDialog';
import type { SalesQuote } from '@mts/types/quote';
const mocks=vi.hoisted(()=>({success:vi.fn(),info:vi.fn(),warning:vi.fn(),error:vi.fn(),close:vi.fn(),members:[] as SalesQuote[]}));
vi.mock('sonner',()=>({toast:mocks}));
vi.mock('@mts/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic-test'}}})},from:()=>({select:()=>({eq:()=>({order:async()=>({data:mocks.members,error:null})})})})}}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let root:ReturnType<typeof createRoot>, container:HTMLDivElement, client:QueryClient;
const quote={id:'quote-fixture',quote_number:'TEST',customer_name:'Synthetic',customer_email:'first@example.invalid',quote_v2_backend:true,quote_v2_revision:1,status:'sent',share_token:'test'} as SalesQuote;
const request={email:['first@example.invalid','second@example.invalid'],sms:[],note:'Saved note',measureDecision:'needed'};
const capability={enabled:true,native:true,canSend:true,supportsResend:true,supportsQuoteSelection:true,reservation:{requestKey:'original-request',state:'sent',request,resend:false}};
const fetchMock=vi.fn();
beforeEach(()=>{vi.clearAllMocks();mocks.members=[];vi.stubGlobal('fetch',fetchMock);client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(()=>root.unmount());container.remove();client.clear();vi.unstubAllGlobals();});
const response=(body:unknown,ok=true)=>({ok,json:async()=>body});
async function render(q=quote){await act(async()=>{root.render(React.createElement(QueryClientProvider,{client},React.createElement(SendQuoteDialog,{open:true,onClose:mocks.close,quote:q})));});}
function button(label:string){const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()===label);expect(b).toBeDefined();return b!;}
async function click(label:string){await act(async()=>button(label).click());}
function posted(){return fetchMock.mock.calls.filter(([,options])=>options?.method==='POST').map(([,options])=>JSON.parse(options.body));}
it('restores all recipients and sends a new key with an explicit resend action',async()=>{
 fetchMock.mockResolvedValueOnce(response(capability)).mockResolvedValueOnce(response({email:{sent:true},sms:{sent:false}}));
 await render(); expect(document.body.textContent).toContain('creates a new message');
 expect([...document.querySelectorAll('input[type=email]')].map(x=>(x as HTMLInputElement).value)).toEqual(request.email);
 await click('Send again');
 expect(posted()[0]).toMatchObject({deliveryMode:'resend',previousDeliveryKey:'original-request',emails:request.email,measureDecision:'needed'});
 expect(posted()[0].idempotencyKey).not.toBe('original-request');
 expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('Accepted for sending'));
});
it('keeps the same key after an HTTP failure and a background quote refresh',async()=>{
 fetchMock.mockResolvedValueOnce(response(capability)).mockResolvedValueOnce(response({message:'Reservation timed out'},false)).mockResolvedValueOnce(response({email:{sent:true}}));
 await render();await click('Send again');expect(mocks.close).not.toHaveBeenCalled();
 await render({...quote,customer_email:'background@example.invalid'});await click('Send again');
 expect(posted()).toHaveLength(2);expect(posted()[0]).toEqual(posted()[1]);
});
it('says no new message for a replay instead of showing a sent success',async()=>{
 fetchMock.mockResolvedValueOnce(response(capability)).mockResolvedValueOnce(response({email:{sent:false,alreadySent:true}}));
 await render();await click('Send again');
 expect(mocks.success).not.toHaveBeenCalled();expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining('No new message'));
});
it('keeps provider failures visible and the dialog open',async()=>{
 fetchMock.mockResolvedValueOnce(response(capability)).mockResolvedValueOnce(response({email:{sent:false,error:'Recipient rejected'}}));
 await render();await click('Send again');
 expect(document.querySelector('[role=alert]')?.textContent).toBe('Email Recipient rejected');expect(mocks.warning).toHaveBeenCalledWith('Email Recipient rejected');expect(mocks.close).not.toHaveBeenCalled();
});
it('resumes the saved request with its original key and measure decision',async()=>{
 fetchMock.mockResolvedValueOnce(response({...capability,reservation:{...capability.reservation,state:'pending'}})).mockResolvedValueOnce(response({email:{sent:true}}));
 await render();expect(document.querySelector('fieldset')?.disabled).toBe(true);await click('Resume delivery');
 expect(posted()[0]).toMatchObject({idempotencyKey:'original-request',measureDecision:'needed'});expect(posted()[0].deliveryMode).toBeUndefined();
});
it('blocks sending until delivery status is available',async()=>{
 fetchMock.mockReturnValue(new Promise(()=>{}));await render();
 expect(document.body.textContent).toContain('Checking previous delivery');expect(button('Send Quote Email').disabled).toBe(true);expect(posted()).toHaveLength(0);
});
it('blocks uncertain outcomes and explains why another send is unavailable',async()=>{
 fetchMock.mockResolvedValueOnce(response({...capability,canSend:false,reservation:{...capability.reservation,state:'uncertain'}}));await render();
 expect(document.body.textContent).toContain('unknown outcome');expect(button('Send Quote Email').disabled).toBe(true);
});

it('reports only newly accepted recipients when a retry skips an earlier success',async()=>{
 fetchMock.mockResolvedValueOnce(response(capability)).mockResolvedValueOnce(response({email:{sent:true,acceptedCount:1}}));
 await render();await click('Send again');
 expect(mocks.success).toHaveBeenCalledWith('Accepted for sending: email to 1 recipient');
});

it('offers an authenticated preview instead of a dead customer link for an unsent draft', async () => {
 await render({...quote,quote_v2_backend:false,status:'draft',sent_at:null,signed_at:null});
 expect(document.body.textContent).toContain('customer link becomes available when the quote is sent');
 const preview=document.querySelector('a[href="/crm/quote/quote-fixture/contract-preview/"]');
 expect(preview?.textContent).toContain('Preview quote');
 expect(document.querySelector('a[aria-label="Open quote link in new tab"]')).toBeNull();
 expect(document.body.textContent).not.toContain('/quote/test');
});
it('preserves the customer link for a quote already sent', async () => {
 await render({...quote,quote_v2_backend:false});
 expect(document.querySelector('a[aria-label="Open quote link in new tab"]')?.getAttribute('href')).toContain('/quote/test');
});

const draft={...quote,status:'draft',sent_at:null,signed_at:null,customer_signature:null,total_amount:2855.14,installer_notes:'{}'} as SalesQuote;
const ready={...capability,reservation:null};
it('places payment terms between quotes and delivery with the approved cent preview',async()=>{
 fetchMock.mockResolvedValueOnce(response(ready));await render(draft);
 await click('In-house 3-month payments');
 const headings=[...document.querySelectorAll('h3')].map(x=>x.textContent);
 expect(headings.slice(0,3)).toEqual(['Quotes to send','Payment terms','Delivery']);
 expect(document.body.textContent).toContain('$951.71');expect(document.body.textContent).toContain('$951.72');
 expect(document.body.textContent).toContain('2 months after full deposit');
 expect(document.body.textContent).not.toContain('Save payment terms');expect(posted()).toHaveLength(0);
});
it('saves the chosen terms before sending with the saved revision',async()=>{
 fetchMock.mockResolvedValueOnce(response(ready)).mockResolvedValueOnce(response({quoteId:quote.id,revision:2})).mockResolvedValueOnce(response({email:{sent:true}}));
 await render(draft);await click('In-house 3-month payments');await click('Send Quote Email');
 const posts=posted();expect(posts).toHaveLength(2);
 expect(fetchMock.mock.calls[1][0]).toContain('/payment-schedule/');
 expect(posts[0]).toMatchObject({schedule:'in_house_three_month_v1',revision:1});
 expect(posts[1]).toMatchObject({expectedRevision:2,selectedQuoteRevisions:{[quote.id]:2}});
});
it('does not send when a payment terms save fails and reuses its request on retry',async()=>{
 fetchMock.mockResolvedValueOnce(response(ready)).mockResolvedValueOnce(response({message:'Quote changed'},false)).mockResolvedValueOnce(response({quoteId:quote.id,revision:2})).mockResolvedValueOnce(response({email:{sent:true}}));
 await render(draft);await click('In-house 3-month payments');await click('Send Quote Email');
 expect(posted()).toHaveLength(1);expect(mocks.close).not.toHaveBeenCalled();
 expect(document.querySelector('fieldset')?.disabled).toBe(true);
 await click('Send Quote Email');expect(posted()[1]).toEqual(posted()[0]);expect(posted()[2].expectedRevision).toBe(2);
});
it('preserves the complete delivery payload across a failure and background edits',async()=>{
 fetchMock.mockResolvedValueOnce(response(ready)).mockResolvedValueOnce(response({quoteId:quote.id,revision:2})).mockResolvedValueOnce(response({message:'Timeout'},false)).mockResolvedValueOnce(response({email:{sent:true}}));
 await render(draft);await click('In-house 3-month payments');await click('Send Quote Email');
 await render({...draft,quote_v2_revision:8,installer_notes:'{"__adminControls":{"paymentSchedule":"in_house_three_month_v1"}}'});await click('Send Quote Email');
 expect(posted()).toHaveLength(3);expect(posted()[2]).toEqual(posted()[1]);
});
it('creates a revision for changed sent terms and stops before sending it',async()=>{
 fetchMock.mockResolvedValueOnce(response(capability)).mockResolvedValueOnce(response({quoteId:'reviewed-revision',revision:1}));
 await render({...quote,total_amount:2855.14});await click('In-house 3-month payments');await click('Send again');
 expect(posted()).toHaveLength(1);expect(document.body.textContent).toContain('Review that revision');expect(button('Send Quote Email').disabled).toBe(true);
});
it('keeps signed terms locked and sends without changing them',async()=>{
 fetchMock.mockResolvedValueOnce(response(capability)).mockResolvedValueOnce(response({email:{sent:true}}));
 await render({...quote,signed_at:'2026-10-03T12:00:00Z'});
 expect(button('In-house 3-month payments').disabled).toBe(true);await click('Send again');expect(posted()).toHaveLength(1);
});
it('returns saved in-house terms to standard in the send action',async()=>{
 fetchMock.mockResolvedValueOnce(response(ready)).mockResolvedValueOnce(response({quoteId:quote.id,revision:2})).mockResolvedValueOnce(response({email:{sent:true}}));
 await render({...draft,installer_notes:'{"__adminControls":{"paymentSchedule":"in_house_three_month_v1"}}'});
 expect(button('In-house 3-month payments').getAttribute('aria-pressed')).toBe('true');
 await click('Standard payments');await click('Send Quote Email');expect(posted()[0].schedule).toBe('standard');
});
it('does not write terms when standard is unchanged, cancelled, or contacts are missing',async()=>{
 fetchMock.mockResolvedValueOnce(response(ready));await render({...draft,customer_email:null});
 await click('In-house 3-month payments');await click('Send Quote Email');expect(posted()).toHaveLength(0);
 await click('Cancel');expect(mocks.close).toHaveBeenCalled();
});

it('previews each selected alternative and saves every changed quote before one delivery',async()=>{
 const a={...draft,quote_group_id:'group',quote_letter:'A'} as SalesQuote;
 const b={...a,id:'alternative-b',quote_letter:'B',total_amount:300.01};mocks.members=[a,b];
 fetchMock.mockResolvedValueOnce(response(ready)).mockResolvedValueOnce(response({quoteId:a.id,revision:2})).mockResolvedValueOnce(response({quoteId:b.id,revision:2})).mockResolvedValueOnce(response({email:{sent:true}}));
 await render(a);
 await act(async()=>{(document.querySelector('[role=checkbox]') as HTMLElement).click();});
 await act(async()=>{([...document.querySelectorAll('[role=checkbox]')].find(x=>x.closest('label')?.textContent?.includes('Quote B')) as HTMLElement).click();});
 await click('In-house 3-month payments');expect(document.body.textContent).toContain('$100.01');
 await click('Send 2 Quotes');expect(posted().slice(0,2).map(b=>b.schedule)).toEqual(['in_house_three_month_v1','in_house_three_month_v1']);
 expect(posted()[2]).toMatchObject({selectedQuoteIds:[a.id,b.id],selectedQuoteRevisions:{[a.id]:2,[b.id]:2},multipleQuotesApproved:true});
});
it('preserves distinct saved schedules unless staff explicitly applies a common choice',async()=>{
 const a={...draft,quote_group_id:'group',quote_letter:'A'} as SalesQuote;
 const b={...a,id:'alternative-b',quote_letter:'B',total_amount:300.01,installer_notes:'{"__adminControls":{"paymentSchedule":"in_house_three_month_v1"}}'};mocks.members=[a,b];
 fetchMock.mockResolvedValueOnce(response(ready)).mockResolvedValueOnce(response({email:{sent:true}}));await render(a);
 await act(async()=>{(document.querySelector('[role=checkbox]') as HTMLElement).click();});
 await act(async()=>{([...document.querySelectorAll('[role=checkbox]')].find(x=>x.closest('label')?.textContent?.includes('Quote B')) as HTMLElement).click();});
 expect(document.body.textContent).toContain('different payment terms');await click('Send 2 Quotes');expect(posted()).toHaveLength(1);
});
it('retries a partially saved multi-quote request without saving the first quote twice',async()=>{
 const a={...draft,quote_group_id:'group',quote_letter:'A'} as SalesQuote;
 const b={...a,id:'alternative-b',quote_letter:'B',total_amount:300.01};mocks.members=[a,b];
 fetchMock.mockResolvedValueOnce(response(ready)).mockResolvedValueOnce(response({quoteId:a.id,revision:2})).mockResolvedValueOnce(response({message:'Temporary save failure'},false)).mockResolvedValueOnce(response({quoteId:b.id,revision:2})).mockResolvedValueOnce(response({email:{sent:true}}));
 await render(a);await act(async()=>{(document.querySelector('[role=checkbox]') as HTMLElement).click();});
 await act(async()=>{([...document.querySelectorAll('[role=checkbox]')].find(x=>x.closest('label')?.textContent?.includes('Quote B')) as HTMLElement).click();});
 await click('In-house 3-month payments');await click('Send 2 Quotes');expect(posted()).toHaveLength(2);expect(mocks.close).not.toHaveBeenCalled();
 await click('Send 2 Quotes');expect(posted()).toHaveLength(4);expect(posted()[2]).toEqual(posted()[1]);expect(posted()[3].selectedQuoteRevisions).toEqual({[a.id]:2,[b.id]:2});
});
