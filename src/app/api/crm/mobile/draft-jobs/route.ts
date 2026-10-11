import { supplierDraftProcessingAvailable, SUPPLIER_DRAFT_UNAVAILABLE_MESSAGE } from '@/lib/crm/supplier-draft-availability';
import { NextRequest,NextResponse } from 'next/server';
import { CrmAuthError,crmAuthErrorResponse,requireCrmUser } from '@/lib/crm/auth';
import { mobileFamily,validateSupplierSpec } from '@/lib/crm/mobile-supplier-spec';
import { recordUnconnectedDraftRuntime } from '@/lib/crm/supplier-draft-runtime';
import { submitSupplierDraftJob } from '@/lib/crm/supplier-draft-job-store';
import { quoteLabProductType } from '@/lib/quote-lab/builder';
import { getProduct } from '@/lib/quote/catalog';
export const runtime='nodejs';
export async function POST(request:NextRequest){
  try{
    const {supabase,user}=await requireCrmUser(request);if(!supplierDraftProcessingAvailable())throw new CrmAuthError(503,SUPPLIER_DRAFT_UNAVAILABLE_MESSAGE);
    const raw=await request.text();if(Buffer.byteLength(raw)>1024*1024)throw new CrmAuthError(413,'Submitted specification exceeds 1 MiB.');
    let body:{requestId?:unknown;spec?:unknown};try{body=JSON.parse(raw);}catch{throw new CrmAuthError(400,'A valid JSON draft specification is required.');}
    if(!body || typeof body.requestId!=='string'|| !/^[a-zA-Z0-9:_-]{1,200}$/.test(body.requestId))throw new CrmAuthError(400,'A stable submission identity is required.');
    let spec;try{spec=validateSupplierSpec(body.spec);}catch(error){throw new CrmAuthError(400,error instanceof Error?error.message:'Invalid draft specification.');}
    for(const line of spec.lines){const product=getProduct(line.productId);if(!product || product.manufacturer!==line.manufacturer || (quoteLabProductType(product.id)??product.productType)!==line.productType || mobileFamily(quoteLabProductType(product.id)??product.productType)!==line.family)throw new CrmAuthError(400,'Manufacturer/product identity must match the current catalog.');}
    // Resolve identity by exact stored IDs. Never fuzzy-match or relink by customer name.
    if(spec.customer.jobId){
      const job=await supabase.from('crm_jobs').select('id,customer_name,meta').eq('id',spec.customer.jobId).is('meta->>deleted_at',null).maybeSingle();
      if(job.error)throw new CrmAuthError(503,'Customer identity could not be verified.');
      if(!job.data||job.data.customer_name!==spec.customer.name)throw new CrmAuthError(409,'Customer identity changed. Reopen the correct appointment/customer.');
    }
    if(spec.customer.sourceId){
      const event=await supabase.from('crm_calendar_events').select('id,job_id,customer_name,event_type').eq('id',spec.customer.sourceId).maybeSingle();
      if(event.error)throw new CrmAuthError(503,'Appointment identity could not be verified.');
      if(!event.data||event.data.event_type!=='sales_consult'||event.data.job_id!==spec.customer.jobId||(event.data.customer_name&&event.data.customer_name!==spec.customer.name))throw new CrmAuthError(409,'The appointment no longer matches this customer.');
    }
    const result=await submitSupplierDraftJob(supabase,user.id,body.requestId,spec);
    if(result.job.state.phase==='queued')result.job=await recordUnconnectedDraftRuntime(supabase,result.job.id,user.id);
    return NextResponse.json(result,{status:result.replayed?200:202,headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return crmAuthErrorResponse(error);}
}
