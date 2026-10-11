import { describe,it,expect } from 'vitest';
import { syntheticDraft } from './mobile-supplier-test-fixture';
import { buildSupplierSpec,type SupplierQuoteSpec } from './mobile-supplier-spec';
import { DraftStepBlocked,initialDraftJobState,priceSupplierSpec,runDraftJob,verifyCustomerDraft,validateDraftReceipt,type CustomerDraftAdapter,type DraftJobStore,type DurableDraftJob,type QuoteReadback,type SupplierDraftAdapter,type SupplierDraftReceipt } from './supplier-draft-orchestrator';

import {NORMAN_805_ACCOUNT} from './supplier-account-policy';
const readCurrentAccount=async()=>({...NORMAN_805_ACCOUNT});
const hash='a'.repeat(64);
function receipt(spec:SupplierQuoteSpec,manufacturer='Norman'):SupplierDraftReceipt{return {...(manufacturer==='Norman'?{account:{...NORMAN_805_ACCOUNT}}:{}),status:'draft',manufacturer,reference:'SYNTHETIC-DRAFT',specHash:hash,currency:'USD',lines:spec.lines.filter(l=>l.manufacturer===manufacturer).map(l=>({lineId:l.id,productCost:'100.00',productCostOnly:true,quantity:l.quantity,physicalUnitsPerQuantity:1,automaticFeeProfile:l.family==='Shutters'?'excluded':'blind_shade_v1'}))};}
function readback(spec:SupplierQuoteSpec):QuoteReadback{const pricing=priceSupplierSpec(spec,[...new Set(spec.lines.map(l=>l.manufacturer))].map(m=>receipt(spec,m)));return {id:'SYNTHETIC-805-DRAFT',status:'draft',revision:3,groupId:'SYNTHETIC-805-DRAFT',letter:'A',customerJobId:spec.customer.jobId,customerName:spec.customer.name,deliveryRecord:false,finalized:false,lines:spec.lines.map(l=>({...structuredClone(l),total:pricing.prices.find(p=>p.lineId===l.id)!.total})),subtotal:pricing.subtotal,tax:pricing.tax,total:pricing.total};}
function storeFor(spec:SupplierQuoteSpec){let saved:DurableDraftJob={id:'SYNTHETIC-JOB',ownerId:'SYNTHETIC-OWNER',spec,state:initialDraftJobState('SYNTHETIC-JOB',spec,hash)},locked=false,checkpoints=0,failAt=0;
  const store:DraftJobStore={async claim(){if(locked)return null;locked=true;return {job:structuredClone(saved),token:'SYNTHETIC-LEASE'};},async checkpoint(next,revision){checkpoints++;if(failAt===checkpoints)throw new Error('SYNTHETIC interruption');if(saved.state.revision!==revision)throw new Error('Revision conflict');saved=structuredClone(next);},async release(){locked=false;}};
  return {store,get:()=>saved,interruptAt:(n:number)=>{failAt=n;}};
}
describe('supplier draft orchestration',()=>{
  it('multiplies product alone then adds fees exactly once for all eight factors',()=>{
    const expected=['214.00','239.00','264.00','289.00','314.00','339.00','364.00','389.00'];
    ['1.75','2','2.25','2.5','2.75','3','3.25','3.5'].forEach((factor,i)=>{const spec=buildSupplierSpec(syntheticDraft());spec.multiplier=factor as never;const r=priceSupplierSpec(spec,[receipt(spec)]);expect(r.total).toBe(expected[i]);expect(r.prices[0].installation).toBe('25.00');expect(r.prices[0].shipping).toBe('14.00');});
  });
  it('reconciles coupled physical-unit fees without double-counting desired opening fees',()=>{
    const spec=buildSupplierSpec(syntheticDraft()),r=receipt(spec);r.lines[0].physicalUnitsPerQuantity=2;
    expect(priceSupplierSpec(spec,[r]).prices[0]).toMatchObject({total:'239.00',merchandiseUnitInput:'161.00'});
  });
  it('shutters receive user installation and shipping despite source fee exclusion',()=>{
    const spec=buildSupplierSpec(syntheticDraft());spec.lines[0].family='Shutters';const r=receipt(spec);
    expect(priceSupplierSpec(spec,[r]).prices[0]).toMatchObject({total:'239.00',merchandiseUnitInput:'239.00'});
  });
  it('preserves a manually set all-in price without reapplying fees',()=>{
    const spec=buildSupplierSpec(syntheticDraft());spec.lines[0].manualAllInPrice='87.00';expect(priceSupplierSpec(spec,[receipt(spec)]).prices[0]).toMatchObject({total:'87.00',manualPreserved:true,merchandiseUnitInput:null});
  });
  it('half-up rounds product multiplication before adding fees',()=>{
    const spec=buildSupplierSpec(syntheticDraft());spec.multiplier='2.5';const r=receipt(spec);r.lines[0].productCost='0.01';expect(priceSupplierSpec(spec,[r]).total).toBe('39.03');
  });
  it('applies an explicitly recorded user fee override instead of reapplying defaults',()=>{
    const spec=buildSupplierSpec(syntheticDraft());spec.lines[0].feeOverride={installationAmount:'30.00',shippingAmount:'0.00',instruction:'SYNTHETIC explicit override'};
    expect(priceSupplierSpec(spec,[receipt(spec)]).prices[0]).toMatchObject({total:'230.00',installation:'30.00',shipping:'0.00',merchandiseUnitInput:'191.00'});
  });
  it('tax and ambiguous shipping genuinely block pricing rather than invent values',()=>{
    const spec=buildSupplierSpec(syntheticDraft());spec.tax.treatment='unresolved';expect(()=>priceSupplierSpec(spec,[receipt(spec)])).toThrow(/Tax/);spec.tax.treatment='excluded_confirmed';spec.lines[0].shippingBasis=null;expect(()=>priceSupplierSpec(spec,[receipt(spec)])).toThrow(/shipping/);
  });
  it('rejects bought orders, mismatched evidence, missing lines and non-product costs',()=>{
    const spec=buildSupplierSpec(syntheticDraft()),step=initialDraftJobState('JOB',spec,hash).suppliers[0];
    for(const mutate of [(r:any)=>r.status='ordered',(r:any)=>r.specHash='wrong',(r:any)=>r.lines=[],(r:any)=>r.lines[0].productCostOnly=false,(r:any)=>r.lines[0].productCost='NaN']){const r=receipt(spec);mutate(r);expect(()=>validateDraftReceipt(r,step,spec,hash)).toThrow();}
  });
  it('rejects receipt claims that contradict source automatic-fee eligibility or coupled counts',()=>{
    const spec=buildSupplierSpec(syntheticDraft()),step=initialDraftJobState('JOB',spec,hash).suppliers[0],r=receipt(spec);
    r.lines[0].automaticFeeProfile='excluded';expect(()=>validateDraftReceipt(r,step,spec,hash)).toThrow(/source policy/);
    r.lines[0].automaticFeeProfile='blind_shade_v1';r.lines[0].physicalUnitsPerQuantity=2;expect(()=>validateDraftReceipt(r,step,spec,hash)).toThrow(/source policy/);
    spec.lines[0].configuration.coupled_shade_count=2;expect(()=>validateDraftReceipt(r,step,spec,hash)).not.toThrow();
  });
  it('only completes after every draft cost and complete 805 readback',async()=>{
    const spec=buildSupplierSpec(syntheticDraft()),s=storeFor(spec);let draftCalls=0,customerCalls=0;
    const supplier:SupplierDraftAdapter={readCurrentAccount,async createOrResumeDraft(input){expect(input.draftOnly).toBe(true);draftCalls++;return receipt(spec);}};
    const customer:CustomerDraftAdapter={async createOrResumeDraft(input){expect(input.draftOnly).toBe(true);customerCalls++;return readback(spec);},async readback(){return readback(spec);}};
    await runDraftJob('SYNTHETIC-JOB',{store:s.store,suppliers:{Norman:supplier},customer});expect(s.get().state.phase).toBe('complete');
    await runDraftJob('SYNTHETIC-JOB',{store:s.store,suppliers:{Norman:supplier},customer});expect(draftCalls).toBe(1);expect(customerCalls).toBe(1);
  });
  it('mixed suppliers group independently and successful steps remain intact on login blockage',async()=>{
    const spec=buildSupplierSpec(syntheticDraft()),second=structuredClone(spec.lines[0]);second.id=crypto.randomUUID();second.manufacturer='Onyx';second.family='Shutters';second.productId='onyx_shutters';second.productType='Shutters';second.configuration={...second.configuration,material:'SYNTHETIC',louver_size:'SYNTHETIC',tilt_type:'SYNTHETIC',panel_config:'SYNTHETIC'};spec.lines.push(second);
    const s=storeFor(spec);let norman=0,onyx=0;
    const suppliers={Norman:{readCurrentAccount,async createOrResumeDraft(){norman++;return receipt(spec,'Norman');}},Onyx:{async createOrResumeDraft(){onyx++;throw new DraftStepBlocked({code:'login_required',message:'SYNTHETIC Onyx login required.'});}}};
    await runDraftJob('SYNTHETIC-JOB',{store:s.store,suppliers,customer:undefined});expect(s.get().state.suppliers.map(s=>s.status)).toEqual(['draft_ready','blocked']);expect(s.get().state.phase).toBe('blocked');
    const onyxAdapter:SupplierDraftAdapter={async createOrResumeDraft(){onyx++;return receipt(spec,'Onyx');}};
    await runDraftJob('SYNTHETIC-JOB',{store:s.store,suppliers:{...suppliers,Onyx:onyxAdapter},customer:undefined});expect(norman).toBe(1);expect(onyx).toBe(2);expect(s.get().state.suppliers.every(s=>s.status==='draft_ready')).toBe(true);
  });
  it('missing options block only that supplier before any portal operation',async()=>{
    const spec=buildSupplierSpec(syntheticDraft());spec.lines[0].controlSide='';const s=storeFor(spec);let calls=0;
    await runDraftJob('SYNTHETIC-JOB',{store:s.store,suppliers:{Norman:{readCurrentAccount,async createOrResumeDraft(){calls++;return receipt(spec);}}},customer:undefined});expect(calls).toBe(0);expect(s.get().state.suppliers[0].blockers[0].code).toBe('missing_options');
  });
  it('uncertain supplier completion resumes using the identical remote identity',async()=>{
    const spec=buildSupplierSpec(syntheticDraft()),s=storeFor(spec),keys:string[]=[];s.interruptAt(2);
    const supplier:SupplierDraftAdapter={readCurrentAccount,async createOrResumeDraft(input){keys.push(input.idempotencyKey);return receipt(spec);}};
    await expect(runDraftJob('SYNTHETIC-JOB',{store:s.store,suppliers:{Norman:supplier},customer:undefined})).rejects.toThrow(/interruption/);
    s.interruptAt(0);await runDraftJob('SYNTHETIC-JOB',{store:s.store,suppliers:{Norman:supplier},customer:undefined});expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);
  });
  it('blocks a wrong Norman account before any draft entry and never switches accounts',async()=>{
    const spec=buildSupplierSpec(syntheticDraft()),s=storeFor(spec);let draftCalls=0;
    const adapter:SupplierDraftAdapter={async readCurrentAccount(){return {dealerId:'SYNTHETIC-WRONG',displayName:'SYNTHETIC OTHER'};},async createOrResumeDraft(){draftCalls++;return receipt(spec);}};
    await runDraftJob('SYNTHETIC-JOB',{store:s.store,suppliers:{Norman:adapter},customer:undefined});expect(draftCalls).toBe(0);expect(s.get().state.blockers[0]).toMatchObject({code:'login_required'});
  });
  it('requires the 805 account on persisted Norman draft cost receipts',()=>{
    const spec=buildSupplierSpec(syntheticDraft()),r=receipt(spec),step=initialDraftJobState('JOB',spec,hash).suppliers[0];r.account={dealerId:'SYNTHETIC-WRONG',displayName:'MIKE S'};
    expect(()=>validateDraftReceipt(r,step,spec,hash)).toThrow(/RA00743/);
  });
  it('another worker cannot run while the first lease is held',async()=>{
    const spec=buildSupplierSpec(syntheticDraft()),s=storeFor(spec);await s.store.claim('SYNTHETIC-JOB');expect(await runDraftJob('SYNTHETIC-JOB',{store:s.store,suppliers:{},customer:undefined})).toEqual({claimed:false});
  });
  it('wrong readback options, fractions, notes, customer, status and total fail',()=>{
    const spec=buildSupplierSpec(syntheticDraft()),pricing=priceSupplierSpec(spec,[receipt(spec)]);
    for(const mutate of [(q:any)=>q.lines[0].configuration.color='WRONG',(q:any)=>q.lines[0].widthFraction='1/2',(q:any)=>q.lines[0].notes='lost',(q:any)=>q.customerName='WRONG',(q:any)=>q.status='sent',(q:any)=>q.total='0.00',(q:any)=>q.lines.push(q.lines[0])]){const q=readback(spec);mutate(q);expect(()=>verifyCustomerDraft(spec,pricing,q)).toThrow();}
  });
});
