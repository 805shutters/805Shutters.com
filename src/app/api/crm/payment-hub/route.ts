import { NextRequest, NextResponse } from 'next/server';
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from '@/lib/crm/auth';
import { isMikePaymentAdminEmail } from '@/lib/crm/allowed-users';
import { recordHubReceipt, updateHubCheck } from '@/lib/crm/payment-hub-mutations';
import { hubRecord } from '@/lib/crm/payment-hub';
export const runtime='nodejs';
export async function POST(request: NextRequest) {
  try {
    const {supabase,email}=await requireCrmUser(request);
    if(!isMikePaymentAdminEmail(email)) throw new CrmAuthError(403,'Only Mike can record payments or update check clearance.');
    const body=hubRecord(await request.json());
    const result=body.action==='record' ? await recordHubReceipt(supabase,body,email) : body.action==='check' ? await updateHubCheck(supabase,body,email) : null;
    if(!result) throw new CrmAuthError(400,'Choose a supported payment action.');
    return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return crmAuthErrorResponse(error); }
}
