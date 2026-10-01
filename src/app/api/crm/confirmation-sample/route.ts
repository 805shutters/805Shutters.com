import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { isCrmOwnerAdminEmail } from "@/lib/crm/allowed-users";
import { confirmationSample, confirmationSampleMedia } from "@/lib/booking/confirmation-sample";
import { isBookingDeliveryEnabled } from "@/lib/booking/delivery-config";
import { sendSms } from "@/lib/notify/twilio";
export const runtime = "nodejs";
const action = "appointment_confirmation_sample";
async function context(request: NextRequest) {
  const ctx = await requireCrmUser(request);
  if (!isCrmOwnerAdminEmail(ctx.email)) throw new CrmAuthError(403, "Owner access is required.");
  return ctx;
}
async function latest(supabase: Awaited<ReturnType<typeof context>>["supabase"]) {
  const {data,error} = await supabase.from("crm_activity_events").select("id,after_data").eq("action",action).contains("metadata",{sampleKey:confirmationSample.key}).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if (error) throw new CrmAuthError(503,"Sample delivery log is unavailable.");
  return data;
}
export async function POST(request: NextRequest) {
  try {
    const {supabase,email,user} = await context(request);
    if (!isBookingDeliveryEnabled()) throw new CrmAuthError(503,"Texting is disabled in this environment.");
    const prior = await latest(supabase);
    // Do not retry a sample that may already have reached the provider.
    if (prior) return NextResponse.json({result:prior.after_data,alreadyAttempted:true});
    const {data:log,error} = await supabase.from("crm_activity_events").insert({actor_auth_user_id:user.id,actor_email:email,entity_type:"system",action,metadata:{sampleKey:confirmationSample.key,to:confirmationSample.to},after_data:{pending:true}}).select("id").single();
    if (error || !log) throw new CrmAuthError(503,"Could not reserve the sample send.");
    const result = await sendSms({to:confirmationSample.to,body:confirmationSample.body,mediaUrls:confirmationSampleMedia,timeoutMs:15000});
    const {error:logError} = await supabase.from("crm_activity_events").update({after_data:result}).eq("id",log.id);
    return NextResponse.json({result,logged:!logError});
  } catch(error) {return crmAuthErrorResponse(error);}
}
export async function GET(request: NextRequest) {
  try {
    const {supabase} = await context(request);
    const prior = await latest(supabase);
    const result = prior?.after_data as {sid?:string} | undefined;
    if (!result?.sid || !/^(?:SM|MM)[0-9a-f]{32}$/i.test(result.sid)) return NextResponse.json({result:prior?.after_data ?? null});
    const account = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!account || !token) return NextResponse.json({result});
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account}/Messages/${result.sid}.json`,{headers:{Authorization:`Basic ${Buffer.from(`${account}:${token}`).toString("base64")}`},cache:"no-store",signal:AbortSignal.timeout(10000)});
    if (!response.ok) return NextResponse.json({result,statusLookupFailed:true});
    const message = await response.json();
    return NextResponse.json({result,deliveryStatus:message.status,errorCode:message.error_code,numMedia:message.num_media,from:message.from,to:message.to});
  } catch(error) {return crmAuthErrorResponse(error);}
}
