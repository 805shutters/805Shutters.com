// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PaymentHubFeed } from './PaymentHubFeed';
import { buildPaymentHub } from '@/lib/crm/payment-hub';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let root:ReturnType<typeof createRoot>,container:HTMLDivElement;
const reload=vi.fn(async()=>{}),open=vi.fn();
const rows=buildPaymentHub({objects:[],allocations:[],quotes:[{id:'q1',customer_name:'Sample customer'}],entries:[],requests:[],classifications:[],payments:[{id:'p1',quote_id:'q1',bookkeeping_entry_id:null,amount:100,paid_at:'2026-09-19',payment_label:'Deposit',payment_type:'check',meta:{}},{id:'p2',quote_id:'q1',bookkeeping_entry_id:null,amount:200,paid_at:'2026-09-18',payment_label:'Balance payment',payment_type:'venmo',meta:{}}]});
async function mount(canReview=true){await act(()=>root.render(React.createElement(PaymentHubFeed,{rows,targets:[{id:'q1',key:'quote:q1',customer_name:'Sample customer',total:300}],token:'test',canReview,query:'',onSquare:vi.fn(),onReload:reload,onOpenChange:open})));}
async function click(text:string){await act(()=>{[...container.querySelectorAll('button')].find(b=>b.textContent===text)!.click();});}
beforeEach(()=>{vi.stubGlobal('React',React);container=document.createElement('div');document.body.append(container);root=createRoot(container);vi.clearAllMocks();});
afterEach(async()=>{await act(()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it('shows method and purpose separately and filters without losing the full default feed',async()=>{
 await mount();expect(container.querySelectorAll('tbody tr')).toHaveLength(2);expect(container.querySelector('tbody tr')?.textContent).toContain('CheckDeposit');
 const select=container.querySelector('select')!;await act(()=>{select.value='balance';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(container.querySelectorAll('tbody tr')).toHaveLength(1);expect(container.querySelector('tbody tr')?.textContent).toContain('VenmoBalance');
});
it('requires an explicit purpose in the received payment form and pauses background refresh',async()=>{
 await mount();await click('Record payment');expect(open).toHaveBeenLastCalledWith(true);
 const purpose=[...container.querySelectorAll('label')].find(l=>l.textContent?.includes('What is this payment for?'))!.querySelector('select')!;
 expect([...purpose.options].map(o=>o.value)).toEqual(['','deposit','balance','progress','full']);
 expect(container.textContent).toContain('Name printed on check');expect(container.textContent).toContain('Issuing bank name');
 await click('Close');expect(open).toHaveBeenLastCalledWith(false);
});
it('shows unverified historical checks and no mutation controls for readers',async()=>{
 await mount(false);expect(container.textContent).not.toContain('Record payment');
 await act(()=>container.querySelector<HTMLButtonElement>('button[aria-label="View payment p1"]')!.click());
 expect(container.textContent).toContain('Clearance unverified');expect(container.textContent).not.toContain('Save check status');
});
