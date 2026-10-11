import { describe,it,expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSupplierSpec, canonicalJson, type SupplierQuoteSpec } from './mobile-supplier-spec';
import { syntheticDraft } from './mobile-supplier-test-fixture';
import { createCrmSupplierCustomerDraftAdapter, stableDraftRequestUuid, type CrmDraftDeploymentEvidence } from './crm-supplier-customer-draft-adapter';
import { priceSupplierSpec,verifyCustomerDraft,initialDraftJobState,runDraftJob,type DurableDraftJob,type CustomerDraftProgress,type SupplierDraftReceipt } from './supplier-draft-orchestrator';
import { MOBILE_QUOTE_ACCOUNT_ID } from './mobile-quote-draft';
import { customerChargeEligible,customerPhysicalUnits } from '@/lib/quote/customer-charges';

type Row=Record<string,any>;
const actor='11111111-1111-4111-8111-111111111111',quoteId='22222222-2222-4222-8222-222222222222',group='33333333-3333-4333-8333-333333333333';
const key='805-customer-draft:44444444-4444-4444-8444-444444444444:'+ 'a'.repeat(64);
const evidence:CrmDraftDeploymentEvidence={accountId:MOBILE_QUOTE_ACCOUNT_ID,feePolicy:'blind-shade-install-ship-v1',reference:'SYNTHETIC deployed-contract evidence; not production verification'};
function fixture(two=false){
  const spec=buildSupplierSpec(syntheticDraft());spec.lines[0].designNotes='SYNTHETIC design note';
  if(two){const line=structuredClone(spec.lines[0]);line.id='55555555-5555-4555-8555-555555555555';line.room='SYNTHETIC SECOND';line.position='B';line.widthWhole=48;line.notes='Second note';spec.lines.push(line);}
  const receipt:SupplierDraftReceipt={account:{dealerId:'RA00743',displayName:'MIKE S'},status:'draft',manufacturer:'Norman',reference:'SYNTHETIC-DRAFT',specHash:'a'.repeat(64),currency:'USD',lines:spec.lines.map((line,i)=>({lineId:line.id,productCost:i?'200.00':'100.00',productCostOnly:true,quantity:line.quantity,physicalUnitsPerQuantity:1,automaticFeeProfile:'blind_shade_v1'}))};
  return {spec,receipt};
}
/** In-memory transport only; production RPC parsing code is exercised unchanged. */
function database(){
 const rows:Record<string,Row[]>={sales_quotes:[],sales_quote_line_items:[],sales_quote_designs:[],sales_quote_v2_deliveries:[],mobile_quote_photos:[]};
 const calls:{name:string;args:Row}[]=[],committed:Record<string,number>={},cache=new Map<string,{args:string;value:Row}>();
 let lose='',after:((name:string)=>void)|null=null;
 const db={from(table:string){if(!rows[table])throw new Error('Unexpected table '+table);const filters:((r:Row)=>boolean)[]=[];let single=false;
  const q:any={select(){return q;},eq(k:string,v:unknown){filters.push(r=>r[k]===v);return q;},in(k:string,v:unknown[]){filters.push(r=>v.includes(r[k]));return q;},order(){return q;},maybeSingle(){single=true;return q;},then(resolve:any,reject:any){return Promise.resolve({data:single?rows[table].find(r=>filters.every(f=>f(r)))??null:rows[table].filter(r=>filters.every(f=>f(r))),error:null}).then(resolve,reject);}};return q;},
  async rpc(name:string,args:Row){calls.push({name,args:structuredClone(args)});const cacheKey=name+':'+(args.p_idempotency_key??args.p_request_id);const prior=cache.get(cacheKey);
   if(prior){if(prior.args!==canonicalJson(args))throw new Error('IDEMPOTENCY PAYLOAD CHANGED');return {data:structuredClone(prior.value),error:null};}
   let value:Row;const q=rows.sales_quotes[0];
   if(name==='create_quote_v2_draft'||name==='create_mobile_quote_v2_draft'){
    const p=args.p_quote_patch;rows.sales_quotes.push({id:quoteId,quote_number:'SYNTHETIC-A',account_id:MOBILE_QUOTE_ACCOUNT_ID,created_by:args.p_actor_id,created_job_id:args.p_created_job_id??null,customer_name:p.customerName,customer_phone:p.customerPhone??null,customer_email:p.customerEmail??null,customer_address:p.customerAddress??null,appointment_date:p.appointmentDate??null,status:'draft',quote_v2_status:'draft',quote_v2_backend:true,quote_v2_revision:1,quote_group_id:group,quote_letter:'A',total_amount:0});
    value={backend:'authoritative_v2',quoteId,quoteNumber:'SYNTHETIC-A',revision:1,status:'draft',quoteV2Status:'draft',lineCount:0};
   }else if(name==='mutate_quote_v2_structure'){
    if(args.p_expected_revision!==q.quote_v2_revision)throw new Error('REVISION CONFLICT');
    for(const op of args.p_operations){if(op.type==='line.create'){const p=op.patch;rows.sales_quote_line_items.push({id:op.lineItemId,quote_id:quoteId,room_name:p.roomName,product_type:p.productType,width_whole:p.widthWhole,width_fraction:p.widthFraction,height_whole:p.heightWhole,height_fraction:p.heightFraction,quantity:p.quantity,sort_order:p.sortOrder});}else if(op.type==='design.upsert'){
      const p=op.patch,d:Row={id:op.designId,line_item_id:op.lineItemId,variant:'A',product_type:p.productType,notes:p.notes??null,options_json:structuredClone(p.optionsJson),unit_price:0,quote_v2_price_status:'pending'};
      const m={supplier:'supplier',material:'material',louverSize:'louver_size',tiltType:'tilt_type',hingeColor:'hinge_color',panelConfig:'panel_config',mountType:'mount_type',shadeType:'shade_type',liftSystem:'lift_system',valance:'valance',fabric:'fabric',motorType:'motor_type',remoteType:'remote_type',hardSurfaceInstall:'hard_surface_install',ladderOver15ft:'ladder_over_15ft',requiresTakedown:'requires_takedown'};
      for(const [a,b]of Object.entries(m))if(p[a]!=null)d[b]=p[a];rows.sales_quote_designs.push(d);rows.sales_quote_line_items.find(l=>l.id===op.lineItemId)!.selected_design_id=op.designId;
    }else throw new Error('Forbidden structure operation '+op.type);}
    q.quote_v2_revision++;value={backend:'authoritative_v2',quoteId,revision:q.quote_v2_revision,status:'draft',quoteV2Status:'stale',lineCount:rows.sales_quote_line_items.length,selectedDesigns:Object.fromEntries(rows.sales_quote_line_items.map(l=>[l.id,l.selected_design_id])),operations:args.p_operations};
   }else if(name==='set_sales_quote_line_price'){
    if(args.p_expected_revision!==q.quote_v2_revision)throw new Error('REVISION CONFLICT');
    const l=rows.sales_quote_line_items.find(l=>l.id===args.p_line_item_id)!,d=rows.sales_quote_designs.find(d=>d.id===l.selected_design_id)!,opts=d.options_json;
    const eligible=customerChargeEligible(`${l.product_type} ${opts.catalog_product_id??opts.quote_lab_product_id??''}`,[opts.catalog_program_id,opts.quote_lab_program_id].filter(Boolean).join(' '));
    const units=eligible?customerPhysicalUnits({productId:opts.catalog_product_id??opts.quote_lab_product_id??'',configuration:opts}):0;
    d.unit_price=args.p_unit_price+39*units;d.quote_v2_price_status='authoritative';Object.assign(opts,{manual_price_override:true,manual_customer_charge_policy:'blind-shade-install-ship-v1',customer_charges:{perWindowTotal:39*units},authoritative_once_total:0});
    q.quote_v2_revision++;q.total_amount=rows.sales_quote_line_items.reduce((total,l)=>total+rows.sales_quote_designs.find(d=>d.id===l.selected_design_id)!.unit_price*l.quantity,0);q.quote_v2_status='priced';
    value={designId:d.id,unitPrice:d.unit_price,merchandiseUnitPrice:args.p_unit_price,total:q.total_amount,revision:q.quote_v2_revision,quoteStatus:'priced'};
   }else throw new Error('Forbidden RPC '+name);
   committed[name]=(committed[name]??0)+1;cache.set(cacheKey,{args:canonicalJson(args),value:structuredClone(value)});after?.(name);
   if(lose===name){lose='';throw new Error('SYNTHETIC LOST REPLY');}return {data:value,error:null};
  }};
 return {db:db as unknown as SupabaseClient,rows,calls,committed,loseReply(name:string){lose=name;},afterCommit(fn:(name:string)=>void){after=fn;}};
}
function harness(spec:SupplierQuoteSpec,receipt:SupplierDraftReceipt,options:{evidence?:CrmDraftDeploymentEvidence|null}={}){
 const d=database();let saved:CustomerDraftProgress|null=null;let failCheckpoint:((p:CustomerDraftProgress)=>boolean)|null=null;
 const pricing=priceSupplierSpec(spec,[receipt]);const adapter=createCrmSupplierCustomerDraftAdapter(d.db,actor,options.evidence===null?undefined:options.evidence??evidence);
 const run=()=>adapter.createOrResumeDraft({spec,prices:pricing.prices,idempotencyKey:key,draftOnly:true,journal:{progress:saved,async checkpoint(progress){if(failCheckpoint?.(progress)){failCheckpoint=null;throw new Error('SYNTHETIC CHECKPOINT FAILURE');}saved=structuredClone(progress);}}});
 return {...d,adapter,pricing,run,saved:()=>saved,failCheckpoint(fn:(p:CustomerDraftProgress)=>boolean){failCheckpoint=fn;}};
}
describe('concrete CRM draft RPC adapter',()=>{
 it('creates, reads complete structure before pricing, offsets fees once and preserves exact options/notes/fractions',async()=>{
  const {spec,receipt}=fixture(true),h=harness(spec,receipt);const q=await h.run();verifyCustomerDraft(spec,h.pricing,q);
  expect(q.total).toBe('678.00');expect(q.lines.map(l=>[l.widthFraction,l.heightFraction,l.notes,l.designNotes])).toEqual(spec.lines.map(l=>[l.widthFraction,l.heightFraction,l.notes,l.designNotes]));
  expect(h.calls.filter(c=>c.name==='set_sales_quote_line_price').map(c=>c.args.p_unit_price)).toEqual([200,400]);expect(h.committed).toEqual({create_quote_v2_draft:1,mutate_quote_v2_structure:1,set_sales_quote_line_price:2});
  await h.run();expect(h.committed.set_sales_quote_line_price).toBe(2);expect(h.committed.mutate_quote_v2_structure).toBe(1);
 });
 for(const name of ['create_quote_v2_draft','mutate_quote_v2_structure','set_sales_quote_line_price'])it(`reconciles a lost ${name} reply with exactly the same key and payload`,async()=>{
  const {spec,receipt}=fixture(),h=harness(spec,receipt);h.loseReply(name);await expect(h.run()).rejects.toThrow('LOST REPLY');const q=await h.run();verifyCustomerDraft(spec,h.pricing,q);
  const repeated=h.calls.filter(c=>c.name===name);expect(repeated).toHaveLength(2);expect(repeated[0].args).toEqual(repeated[1].args);expect(h.committed[name]).toBe(1);
 });
 it('reconciles a failed price checkpoint without replaying structural edits or repricing confirmed lines',async()=>{
  const {spec,receipt}=fixture(true),h=harness(spec,receipt);h.failCheckpoint(p=>p.pricedLines.length===1);await expect(h.run()).rejects.toThrow('CHECKPOINT FAILURE');const q=await h.run();verifyCustomerDraft(spec,h.pricing,q);expect(h.committed.set_sales_quote_line_price).toBe(2);expect(h.committed.mutate_quote_v2_structure).toBe(1);
 });
 it('blocks unverified deployed fee policy before any RPC',async()=>{const {spec,receipt}=fixture(),h=harness(spec,receipt,{evidence:null});await expect(h.run()).rejects.toThrow('deployed');expect(h.calls).toHaveLength(0);});
 it('blocks unsupported tax before even creating an empty draft',async()=>{const {spec,receipt}=fixture();spec.tax={treatment:'included_confirmed',amount:'10.00',instruction:'SYNTHETIC explicit tax'};const h=harness(spec,receipt);await expect(h.run()).rejects.toThrow('tax write contract');expect(h.calls).toHaveLength(0);});
 it('preserves a manually entered all-in price and blocks an unrepresentable price',async()=>{
  const f=fixture();f.spec.lines[0].manualAllInPrice='75.00';const h=harness(f.spec,f.receipt);expect((await h.run()).total).toBe('75.00');expect(h.calls.find(c=>c.name==='set_sales_quote_line_price')!.args.p_unit_price).toBe(36);
  f.spec.lines[0].manualAllInPrice='10.00';const blocked=harness(f.spec,f.receipt);await expect(blocked.run()).rejects.toThrow('below source automatic charges');expect(blocked.calls).toHaveLength(0);
 });
 for(const change of ['sent','delivery','wrong_owner','wrong_account','contact'])it(`blocks ${change} before structure or price writes`,async()=>{
  const f=fixture(),h=harness(f.spec,f.receipt);h.afterCommit(name=>{if(name!=='create_quote_v2_draft')return;const q=h.rows.sales_quotes[0];if(change==='sent')q.sent_at='SYNTHETIC';if(change==='delivery')h.rows.sales_quote_v2_deliveries.push({id:'SYNTHETIC',quote_id:quoteId});if(change==='wrong_owner')q.created_by='OTHER';if(change==='wrong_account')q.account_id='OTHER';if(change==='contact')q.customer_phone='OTHER';});
  await expect(h.run()).rejects.toThrow();expect(h.committed.mutate_quote_v2_structure).toBeUndefined();expect(h.committed.set_sales_quote_line_price).toBeUndefined();
 });
 it('blocks a structural dimension mismatch before pricing',async()=>{const f=fixture(),h=harness(f.spec,f.receipt);h.afterCommit(name=>{if(name==='mutate_quote_v2_structure')h.rows.sales_quote_line_items[0].width_fraction='1/8';});await expect(h.run()).rejects.toThrow('Structural widthFraction');expect(h.committed.set_sales_quote_line_price).toBeUndefined();});
 it('lets revision fencing preserve a human price change during partial recovery',async()=>{
  const f=fixture(true),h=harness(f.spec,f.receipt);h.failCheckpoint(p=>p.pricedLines.length===1);await expect(h.run()).rejects.toThrow();h.rows.sales_quotes[0].quote_v2_revision++;h.rows.sales_quote_designs[1].unit_price=777;h.rows.sales_quotes[0].total_amount=1016;
  await expect(h.run()).rejects.toThrow('REVISION CONFLICT');expect(h.rows.sales_quote_designs[1].unit_price).toBe(777);expect(h.committed.mutate_quote_v2_structure).toBe(1);
 });
 it('requires full uploaded photo bindings before workflow completion',async()=>{
  const f=fixture(),h=harness(f.spec,f.receipt);const photo={id:'66666666-6666-4666-8666-666666666666',name:'SYNTHETIC.jpg'};f.spec.lines[0].photos=[photo];let q=await h.run();expect(()=>verifyCustomerDraft(f.spec,h.pricing,q)).toThrow('photo readback');
  h.rows.mobile_quote_photos.push({photo_id:photo.id,line_item_id:f.spec.lines[0].id,quote_id:quoteId,account_id:MOBILE_QUOTE_ACCOUNT_ID,uploaded_at:'SYNTHETIC'});q=await h.adapter.readback(quoteId);verifyCustomerDraft(f.spec,h.pricing,q);expect(h.committed.set_sales_quote_line_price).toBe(1);
 });
 it('detects changed contacts on a later readback without mutating them',async()=>{const f=fixture(),h=harness(f.spec,f.receipt);await h.run();h.rows.sales_quotes[0].customer_email='OTHER';const q=await h.adapter.readback(quoteId);expect(()=>verifyCustomerDraft(f.spec,h.pricing,q)).toThrow('contact readback');});
 it('retains configuration booleans without adding their other fees',async()=>{const f=fixture();Object.assign(f.spec.lines[0].configuration,{hard_surface_install:true,ladder_over_15ft:true,requires_takedown:true});const h=harness(f.spec,f.receipt);const q=await h.run();verifyCustomerDraft(f.spec,h.pricing,q);expect(q.total).toBe('239.00');expect(h.rows.sales_quote_designs[0]).toMatchObject({hard_surface_install:true,ladder_over_15ft:true,requires_takedown:true});});
 it('persists customer stages in the orchestrator journal across a failed RPC reply',async()=>{
  const f=fixture(),h=harness(f.spec,f.receipt);let durable:DurableDraftJob={id:'44444444-4444-4444-8444-444444444444',ownerId:actor,spec:f.spec,state:initialDraftJobState('44444444-4444-4444-8444-444444444444',f.spec,'a'.repeat(64))};
  const store={async claim(){return {job:structuredClone(durable),token:'SYNTHETIC-LEASE'};},async checkpoint(job:DurableDraftJob,revision:number,token:string){expect(token).toBe('SYNTHETIC-LEASE');expect(revision).toBe(durable.state.revision);durable=structuredClone(job);},async release(){}};
  const deps={store,suppliers:{Norman:{async readCurrentAccount(){return {dealerId:'RA00743',displayName:'MIKE S'};},async createOrResumeDraft(){return f.receipt;}}},customer:h.adapter};
  h.loseReply('set_sales_quote_line_price');await runDraftJob(durable.id,deps);expect(durable.state.phase).toBe('blocked');expect(durable.state.customerProgress).toMatchObject({quoteId,structureRevision:2,pricedLines:[]});
  await runDraftJob(durable.id,deps);expect(durable.state.phase).toBe('complete');expect(durable.state.customerProgress!.pricedLines).toEqual([f.spec.lines[0].id]);expect(h.committed).toEqual({create_quote_v2_draft:1,mutate_quote_v2_structure:1,set_sales_quote_line_price:1});
 });
 it('blocks conflicting catalog identity before creating any quote',async()=>{const f=fixture();f.spec.lines[0].configuration.catalog_product_id='shutter';const h=harness(f.spec,f.receipt);await expect(h.run()).rejects.toThrow('Catalog product identity');expect(h.calls).toHaveLength(0);});
 it('roundtrips existing catalog identity unchanged',async()=>{const f=fixture();f.spec.lines[0].configuration.catalog_product_id='roller';const h=harness(f.spec,f.receipt);verifyCustomerDraft(f.spec,h.pricing,await h.run());});
 it('keeps custom UUIDs stable, distinct and valid for existing price RPC requests',()=>{expect(stableDraftRequestUuid(key)).toMatch(/^[\da-f]{8}-[\da-f]{4}-8[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);expect(stableDraftRequestUuid(key)).toBe(stableDraftRequestUuid(key));expect(stableDraftRequestUuid(key)).not.toBe(stableDraftRequestUuid(key+':price'));});
});
