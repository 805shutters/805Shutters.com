// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { SendQuoteDialog } from './SendQuoteDialog';
import type { SalesQuote } from '@mts/types/quote';
const mocks=vi.hoisted(()=>({success:vi.fn(),info:vi.fn(),warning:vi.fn(),error:vi.fn(),close:vi.fn()}));
vi.mock('sonner',()=>({toast:mocks}));
vi.mock('@mts/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic-test'}}})}}}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let root:ReturnType<typeof createRoot>, container:HTMLDivElement, client:QueryClient;
const quote={id:'quote-fixture',quote_number:'TEST',customer_name:'Synthetic',customer_email:'first@example.invalid',quote_v2_backend:true,quote_v2_revision:1,status:'sent',share_token:'test'} as SalesQuote;
const request={email:['first@example.invalid','second@example.invalid'],sms:[],note:'Saved note',measureDecision:'needed'};
const capability={enabled:true,native:true,canSend:true,supportsResend:true,reservation:{requestKey:'original-request',state:'sent',request,resend:false}};
const fetchMock=vi.fn();
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',fetchMock);client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});container=document.createElement('div');document.body.append(container);root=createRoot(container);});
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
