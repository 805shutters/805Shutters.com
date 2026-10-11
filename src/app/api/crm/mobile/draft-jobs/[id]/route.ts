import { supplierDraftProcessingAvailable, SUPPLIER_DRAFT_UNAVAILABLE_MESSAGE } from '@/lib/crm/supplier-draft-availability';
import { NextRequest,NextResponse } from 'next/server';
import { CrmAuthError,crmAuthErrorResponse,requireCrmUser } from '@/lib/crm/auth';
import { recordUnconnectedDraftRuntime } from '@/lib/crm/supplier-draft-runtime';
import { DRAFT_JOB_TABLE,loadSupplierDraftJob } from '@/lib/crm/supplier-draft-job-store';
const headers={'Cache-Control':'private, no-store'};
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{const {supabase,user}=await requireCrmUser(request);if(!supplierDraftProcessingAvailable())throw new CrmAuthError(503,SUPPLIER_DRAFT_UNAVAILABLE_MESSAGE);const {id}=await params;return NextResponse.json({job:await loadSupplierDraftJob(supabase,id,user.id)},{headers});}catch(error){return crmAuthErrorResponse(error);}
}
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const {supabase,user}=await requireCrmUser(request);if(!supplierDraftProcessingAvailable())throw new CrmAuthError(503,SUPPLIER_DRAFT_UNAVAILABLE_MESSAGE);const {id}=await params;const body=await request.json().catch(()=>null);
    if(body?.action!=='resume'||!Number.isInteger(body.expectedRevision))throw new CrmAuthError(400,'Resume requires the last observed revision.');
    const job=await loadSupplierDraftJob(supabase,id,user.id);
    if(job.state.phase==='complete')return NextResponse.json({job},{headers});
    if(job.state.revision!==body.expectedRevision)throw new CrmAuthError(409,'Job progress changed. Reload it before retrying.');
    const state={...job.state,phase:'queued',revision:job.state.revision+1,blockers:[]};
    const saved=await supabase.from(DRAFT_JOB_TABLE).update({state,revision:state.revision}).eq('id',id).eq('owner_id',user.id)
      .eq('revision',body.expectedRevision).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).select('id').maybeSingle();
    if(saved.error||!saved.data)throw new CrmAuthError(409,'A worker is processing this draft or its progress changed. Reload progress.');
    return NextResponse.json({job:await recordUnconnectedDraftRuntime(supabase,id,user.id)},{status:202,headers});
  }catch(error){return crmAuthErrorResponse(error);}
}
