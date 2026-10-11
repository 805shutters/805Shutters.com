import { NORMAN_805_ACCOUNT,isNorman805Account,type SupplierAccountIdentity } from './supplier-account-policy';
import { customerChargeEligible,customerPhysicalUnits } from '@/lib/quote/customer-charges';
import { canonicalJson,supplierSourceFeeProgram, missingSupplierFields, type ShippingBasis, type SupplierQuoteSpec, type SupplierSpecLine } from './mobile-supplier-spec';

export type SupplierBlocker = { code: 'missing_options' | 'login_required' | 'adapter_unavailable' | 'cost_unverified' | 'failed' | 'pricing_decision' | 'readback_mismatch'; message: string; lineId?: string };
export type SupplierDraftReceipt = { account?:SupplierAccountIdentity; status: 'draft'; manufacturer: string; reference: string; specHash: string; currency: 'USD'; lines: { lineId: string; productCost: string; productCostOnly: true; quantity: number; physicalUnitsPerQuantity: number; automaticFeeProfile: 'blind_shade_v1' | 'excluded' }[] };
export type SupplierStep = { expectedAccount?:SupplierAccountIdentity; manufacturer: string; lineIds: string[]; key: string; status: 'queued' | 'processing' | 'blocked' | 'draft_ready'; receipt: SupplierDraftReceipt | null; blockers: SupplierBlocker[]; attempt: number };
export type DraftPrice = { lineId: string; productCost: string; merchandise: string; installation: string; shipping: string; total: string; merchandiseUnitInput: string | null; manualPreserved: boolean };
export type CustomerDraftProgress = {key:string;quoteId:string|null;createRevision:number|null;structureRevision:number|null;revision:number|null;pricedLines:string[]};
export type CustomerDraftJournal = {progress:CustomerDraftProgress|null;checkpoint:(progress:CustomerDraftProgress)=>Promise<void>};
export type QuoteReadback = { customerContact?:{phone:string;email:string;address:string;appointmentDate:string|null}; photos?:{id:string;lineId:string}[]; id: string; revision: number; status: 'draft'; groupId: string; letter: string; customerJobId: string | null; customerName: string; deliveryRecord: false; finalized: false; lines: {id:string;manufacturer:string;productId:string;productType:string;room:string;position:string;widthWhole:number;widthFraction:string;heightWhole:number;heightFraction:string;quantity:number;total:string;configuration:Record<string,unknown>;notes:string;designNotes:string}[]; subtotal: string; tax: string; total: string };
export type DraftJobState = { customerProgress?:CustomerDraftProgress; schemaVersion: 1; revision: number; specHash: string; phase: 'queued' | 'suppliers' | 'blocked' | 'quote_draft' | 'complete'; suppliers: SupplierStep[]; prices: DraftPrice[]; blockers: SupplierBlocker[]; quote: QuoteReadback | null; events: {stage:string;message:string}[] };
export type DurableDraftJob = { id: string; ownerId: string; spec: SupplierQuoteSpec; state: DraftJobState };
export interface DraftJobStore {
  /** Atomic expiring lease, with a fencing token, across all workers. Null means another worker owns it. */
  claim(id:string):Promise<{ job:DurableDraftJob; token:string }|null>;
  checkpoint(job:DurableDraftJob, expectedRevision:number, token:string):Promise<void>;
  release(id:string,token:string):Promise<void>;
}
export interface SupplierDraftAdapter {
  /** Read the CURRENT dealer before Norman draft entry. Never switch accounts. */
  readCurrentAccount?:()=>Promise<SupplierAccountIdentity>;
  /** Must reconcile an existing draft by key after uncertainty; NEVER checkout, buy or send. */
  createOrResumeDraft(input:{expectedAccount:Readonly<SupplierAccountIdentity>|null;allowAccountSwitch:false;manufacturer:string;lines:SupplierSpecLine[];customer:SupplierQuoteSpec['customer'];specHash:string;idempotencyKey:string;draftOnly:true}):Promise<SupplierDraftReceipt>;
}
export interface CustomerDraftAdapter {
  /** Durable key + revisioned reconciliation. Preserve protected records and retain all spec/options/notes. */
  createOrResumeDraft(input:{spec:SupplierQuoteSpec;prices:DraftPrice[];idempotencyKey:string;draftOnly:true;journal?:CustomerDraftJournal}):Promise<QuoteReadback>;
  readback(id:string):Promise<QuoteReadback>;
}
export class DraftStepBlocked extends Error { constructor(public blocker:SupplierBlocker){super(blocker.message);} }
export function initialDraftJobState(id:string,spec:SupplierQuoteSpec,hash:string):DraftJobState {
  const names=[...new Set(spec.lines.map(line=>line.manufacturer))];
  return {schemaVersion:1,revision:1,specHash:hash,phase:'queued',suppliers:names.map(manufacturer=>({...(manufacturer==='Norman'?{expectedAccount:{...NORMAN_805_ACCOUNT}}:{}),manufacturer,lineIds:spec.lines.filter(line=>line.manufacturer===manufacturer).map(line=>line.id),key:`805-cost-draft:${id}:${manufacturer}:${hash}`,status:'queued',receipt:null,blockers:[],attempt:0})),prices:[],blockers:[],quote:null,events:[{stage:'submitted',message:'Specification durably queued. Supplier orders and customer quote remain drafts.'}]};
}
const cents=(s:string)=>{if(!/^\d{1,10}\.\d{2}$/.test(s))throw new DraftStepBlocked({code:'cost_unverified',message:'Actual product cost must be exact nonnegative cents.'});return BigInt(s.replace('.',''));};
const dollars=(c:bigint)=>`${c/100n}.${String(c%100n).padStart(2,'0')}`;
export function validateDraftReceipt(receipt:SupplierDraftReceipt,step:SupplierStep,spec:SupplierQuoteSpec,hash:string) {
  if(step.manufacturer==='Norman'&&!isNorman805Account(receipt.account))throw new DraftStepBlocked({code:'login_required',message:'Norman cost evidence must belong to 805 dealer RA00743 / MIKE S. Account switching is not authorized.'});
  if (receipt.status!=='draft' || receipt.manufacturer!==step.manufacturer || !receipt.reference || receipt.specHash!==hash || receipt.currency!=='USD' || receipt.lines.length!==step.lineIds.length || new Set(receipt.lines.map(line=>line.lineId)).size!==step.lineIds.length) throw new DraftStepBlocked({code:'cost_unverified',message:'Supplier receipt must be an actual matching USD draft with every line exactly once.'});
  for (const cost of receipt.lines) {
    const line=spec.lines.find(line=>line.id===cost.lineId);
    if(!line || !step.lineIds.includes(cost.lineId) || cost.productCostOnly!==true || cost.quantity!==line.quantity || !Number.isInteger(cost.physicalUnitsPerQuantity) || cost.physicalUnitsPerQuantity<1 || !['blind_shade_v1','excluded'].includes(cost.automaticFeeProfile) || (cost.automaticFeeProfile==='blind_shade_v1' && cost.physicalUnitsPerQuantity>4) || (line.family==='Shutters' && cost.automaticFeeProfile!=='excluded'))throw new DraftStepBlocked({code:'cost_unverified',message:'Supplier quantity, physical-unit or source automatic-fee evidence is inconsistent.',lineId:cost.lineId});
    const program=supplierSourceFeeProgram(line.configuration);
    const eligible=customerChargeEligible(`${line.productType} ${line.productId}`,program);
    const expectedProfile=eligible?'blind_shade_v1':'excluded';
    const expectedPhysical=eligible?customerPhysicalUnits({productId:line.productId,configuration:line.configuration}):cost.physicalUnitsPerQuantity;
    if(cost.automaticFeeProfile!==expectedProfile||cost.physicalUnitsPerQuantity!==expectedPhysical)throw new DraftStepBlocked({code:'cost_unverified',message:'Receipt physical count / automatic-fee profile differs from the pinned source policy and submitted options.',lineId:line.id});
    cents(cost.productCost);
  }
}
export function priceSupplierSpec(spec:SupplierQuoteSpec,receipts:SupplierDraftReceipt[]):{prices:DraftPrice[];subtotal:string;tax:string;total:string} {
  const factor=BigInt(Math.round(Number(spec.multiplier)*100));
  const prices=spec.lines.map(line=>{
    const receipt=receipts.find(r=>r.manufacturer===line.manufacturer); const cost=receipt?.lines.find(c=>c.lineId===line.id);
    if(!cost)throw new DraftStepBlocked({code:'cost_unverified',message:'Actual supplier draft cost is missing.',lineId:line.id});
    const product=cents(cost.productCost); const merchandise=(product*factor+50n)/100n;
    if(line.manualAllInPrice!==null)return {lineId:line.id,productCost:cost.productCost,merchandise:dollars(merchandise),installation:'0.00',shipping:'0.00',total:dollars(cents(line.manualAllInPrice)*BigInt(line.quantity)),merchandiseUnitInput:null,manualPreserved:true};
    if(!line.shippingBasis)throw new DraftStepBlocked({code:'pricing_decision',message:'Choose the $14 shipping basis for this line.',lineId:line.id});
    const count:Record<ShippingBasis,number>={line:1,opening:line.openingCount,physical_unit:line.quantity*cost.physicalUnitsPerQuantity};
    const installation=cents(line.feeOverride?.installationAmount??'25.00')*BigInt(line.openingCount),shipping=cents(line.feeOverride?.shippingAmount??'14.00')*BigInt(count[line.shippingBasis]),total=merchandise+installation+shipping;
    const auto=cost.automaticFeeProfile==='blind_shade_v1'?3900n*BigInt(line.quantity*cost.physicalUnitsPerQuantity):0n;
    const base=total-auto;
    if(base<0n || base%BigInt(line.quantity)!==0n || total>999999999999n)throw new DraftStepBlocked({code:'pricing_decision',message:'Target is not representable by the verified automatic-fee unit contract; resolve allocation without changing the specification.',lineId:line.id});
    return {lineId:line.id,productCost:cost.productCost,merchandise:dollars(merchandise),installation:dollars(installation),shipping:dollars(shipping),total:dollars(total),merchandiseUnitInput:dollars(base/BigInt(line.quantity)),manualPreserved:false};
  });
  if(spec.tax.treatment==='unresolved')throw new DraftStepBlocked({code:'pricing_decision',message:'Tax treatment is unresolved. Other-fee exclusion does not decide tax.'});
  const subtotal=prices.reduce((sum,line)=>sum+cents(line.total),0n),tax=cents(spec.tax.amount!);
  return {prices,subtotal:dollars(subtotal),tax:dollars(tax),total:dollars(subtotal+tax)};
}
export function verifyCustomerDraft(spec:SupplierQuoteSpec,pricing:ReturnType<typeof priceSupplierSpec>,quote:QuoteReadback) {
  if(quote.status!=='draft'||quote.deliveryRecord!==false||quote.finalized!==false||!quote.id||!quote.groupId||quote.letter!=='A'||!Number.isInteger(quote.revision)||quote.revision<1||quote.customerJobId!==spec.customer.jobId||quote.customerName!==spec.customer.name||quote.lines.length!==spec.lines.length||new Set(quote.lines.map(line=>line.id)).size!==spec.lines.length||quote.subtotal!==pricing.subtotal||quote.tax!==pricing.tax||quote.total!==pricing.total)throw new DraftStepBlocked({code:'readback_mismatch',message:'Complete customer draft identity, status, revision, line set or totals did not match.'});
  const contact={phone:spec.customer.phone,email:spec.customer.email,address:spec.customer.address,appointmentDate:spec.customer.appointmentDate};
  if((quote.customerContact||Object.values(contact).some(Boolean))&&canonicalJson(quote.customerContact)!==canonicalJson(contact))throw new DraftStepBlocked({code:'readback_mismatch',message:'Customer contact readback differs from the submitted source.'});
  for(const line of spec.lines){const saved=quote.lines.find(saved=>saved.id===line.id),target=pricing.prices.find(price=>price.lineId===line.id)!;
    if(!saved||saved.quantity!==line.quantity||saved.total!==target.total||saved.notes!==line.notes||saved.designNotes!==line.designNotes||canonicalJson(saved.configuration)!==canonicalJson(line.configuration))throw new DraftStepBlocked({code:'readback_mismatch',message:'Customer draft readback differs from the submitted notes/options/price.',lineId:line.id});}
  const expectedPhotos=spec.lines.flatMap(line=>line.photos.map(photo=>({id:photo.id,lineId:line.id})));
  if(expectedPhotos.length&&canonicalJson(expectedPhotos.sort((a,b)=>a.id.localeCompare(b.id)))!==canonicalJson([...(quote.photos??[])].sort((a,b)=>a.id.localeCompare(b.id))))throw new DraftStepBlocked({code:'readback_mismatch',message:'Complete uploaded photo readback is missing or differs from the submitted source.'});
  for(const line of spec.lines){const saved=quote.lines.find(saved=>saved.id===line.id)!;
    for(const key of ['manufacturer','productId','productType','room','position','widthWhole','widthFraction','heightWhole','heightFraction'] as const)if(saved[key]!==line[key])throw new DraftStepBlocked({code:'readback_mismatch',message:'Supplier identity, room or exact dimensions differ in the complete customer readback.',lineId:line.id});}
}
/** Each external side effect gets a stable key and a durable processing checkpoint before it runs. */
export async function runDraftJob(id:string,deps:{store:DraftJobStore;suppliers:Record<string,SupplierDraftAdapter|undefined>;customer:CustomerDraftAdapter|undefined}) {
  const claim=await deps.store.claim(id);if(!claim)return {claimed:false};
  const job=structuredClone(claim.job);const token=claim.token;
  const save=async()=>{const old=job.state.revision;job.state.revision++;await deps.store.checkpoint(structuredClone(job),old,token);};
  try{
    if(job.state.phase==='complete')return {claimed:true,job};
    job.state.phase='suppliers';job.state.blockers=[];
    for(const step of job.state.suppliers){
      if(step.status==='draft_ready'){
        try{validateDraftReceipt(step.receipt!,step,job.spec,job.state.specHash);}catch(error){step.status='blocked';step.blockers=[error instanceof DraftStepBlocked?error.blocker:{code:'cost_unverified',message:'Persisted supplier receipt could not be verified.'}];await save();}
        if(step.status==='draft_ready')continue;
      }
      step.blockers=[];const lines=job.spec.lines.filter(line=>step.lineIds.includes(line.id));
      const missing=lines.flatMap(line=>missingSupplierFields(line).map(field=>({code:'missing_options' as const,message:`${line.room}: ${field} is required.`,lineId:line.id})));
      const adapter=deps.suppliers[step.manufacturer];
      if(missing.length||!adapter){step.status='blocked';step.blockers=missing.length?missing:[{code:'adapter_unavailable',message:`${step.manufacturer} draft adapter is not connected.`}];await save();continue;}
      step.status='processing';step.attempt++;await save();
      try{
        if(step.manufacturer==='Norman'){
          if(!adapter.readCurrentAccount)throw new DraftStepBlocked({code:'adapter_unavailable',message:'Norman adapter must verify the current 805 dealer identity before draft entry.'});
          const identity=await adapter.readCurrentAccount();
          if(!isNorman805Account(identity))throw new DraftStepBlocked({code:'login_required',message:'Use the existing 805 Norman dealer RA00743 / MIKE S session. This job cannot switch accounts.'});
        }
        const receipt=await adapter.createOrResumeDraft({expectedAccount:step.manufacturer==='Norman'?NORMAN_805_ACCOUNT:null,allowAccountSwitch:false,manufacturer:step.manufacturer,lines,customer:job.spec.customer,specHash:job.state.specHash,idempotencyKey:step.key,draftOnly:true});validateDraftReceipt(receipt,step,job.spec,job.state.specHash);step.receipt=receipt;step.status='draft_ready';job.state.events.push({stage:step.manufacturer,message:`Actual draft ${receipt.reference} saved; product costs verified.`});}
      catch(error){step.status='blocked';step.blockers=[error instanceof DraftStepBlocked?error.blocker:{code:'failed',message:error instanceof Error?error.message:'Supplier draft failed.'}];}
      await save();
    }
    if(job.state.suppliers.some(step=>step.status!=='draft_ready')){job.state.phase='blocked';job.state.blockers=job.state.suppliers.flatMap(step=>step.blockers);await save();return {claimed:true,job};}
    try{
      const pricing=priceSupplierSpec(job.spec,job.state.suppliers.map(step=>step.receipt!));job.state.prices=pricing.prices;
      if(!deps.customer)throw new DraftStepBlocked({code:'adapter_unavailable',message:'805 draft quote adapter is not connected; supplier drafts retained.'});
      job.state.phase='quote_draft';await save();
      // A crash after create but before checkpoint must be reconciled by this SAME key.
      const quote=job.state.quote||await deps.customer.createOrResumeDraft({spec:job.spec,prices:pricing.prices,idempotencyKey:`805-customer-draft:${job.id}:${job.state.specHash}`,draftOnly:true,journal:{progress:job.state.customerProgress??null,checkpoint:async progress=>{job.state.customerProgress=progress;await save();}}});
      job.state.quote=quote;await save();
      const readback=await deps.customer.readback(quote.id);verifyCustomerDraft(job.spec,pricing,readback);
      job.state.quote=readback;job.state.phase='complete';job.state.events.push({stage:'readback',message:'Complete customer draft readback passed. Nothing purchased or sent.'});await save();
    }catch(error){job.state.phase='blocked';job.state.blockers=[error instanceof DraftStepBlocked?error.blocker:{code:'failed',message:error instanceof Error?error.message:'Customer draft failed.'}];await save();}
    return {claimed:true,job};
  }finally{await deps.store.release(id,token);}
}
