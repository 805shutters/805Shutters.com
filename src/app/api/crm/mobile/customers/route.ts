import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, CrmAuthError, requireCrmUser } from "@/lib/crm/auth";
import { mobileCustomerMatchesLetter, projectMobileCustomers, type MobileCustomerScope } from "@/lib/crm/mobile-customers";
import { sendSquareOrderPaymentLink } from "@/lib/crm/square-payment-links";

export const runtime = "nodejs";

export async function GET(request:NextRequest) {
  try {
    const {supabase}=await requireCrmUser(request);
    const q=(request.nextUrl.searchParams.get("q")||"").trim().toLowerCase();
    const letter=(request.nextUrl.searchParams.get("letter")||"").trim().toUpperCase();
    const scope:MobileCustomerScope=request.nextUrl.searchParams.get("scope")==="archived"?"archived":"active";
    if(q.length<2&&!/^[A-Z]$/.test(letter)) return NextResponse.json({results:[]});
    const jobsResult=await supabase.from("crm_jobs").select("id,customer_name,phone,email,address,city,state,zip,estimated_total,deposit_paid,meta").limit(1000);
    if(jobsResult.error) throw new CrmAuthError(502,"Customer records could not be loaded.");
    const jobs=(jobsResult.data||[]).filter((j:any)=>(q.length<2||[j.customer_name,j.phone,j.email,j.address,j.city].some(v=>String(v||"").toLowerCase().includes(q)))&&(!letter||mobileCustomerMatchesLetter(j.customer_name,letter))).slice(0,40);
    if(!jobs.length) return NextResponse.json({results:[]});
    const quoteResult=await supabase.from("crm_quotes").select("id,job_id,status,quote_total,deposit_required,customer_phone,customer_email").in("job_id",jobs.map((j:any)=>j.id));
    if(quoteResult.error) throw new CrmAuthError(502,"Contract records could not be loaded.");
    const quoteIds=(quoteResult.data||[]).map((q:any)=>q.id);
    const [payments,credits]=quoteIds.length?await Promise.all([
      supabase.from("crm_quote_bookkeeping_payments").select("quote_id,amount,payment_label").in("quote_id",quoteIds),
      supabase.from("crm_quote_bookkeeping_credits").select("to_quote_id,from_quote_id,amount").or(`to_quote_id.in.(${quoteIds.join(",")}),from_quote_id.in.(${quoteIds.join(",")})`)
    ]):[{data:[],error:null},{data:[],error:null}];
    if(payments.error||credits.error) throw new CrmAuthError(502,"Payment balances could not be verified.");
    return NextResponse.json({results:projectMobileCustomers({jobs:jobs as any,quotes:(quoteResult.data||[]) as any,payments:(payments.data||[]) as any,credits:(credits.data||[]) as any,scope})});
  } catch(error){return crmAuthErrorResponse(error);}
}

export async function POST(request:NextRequest) {
  try {
    const {supabase,email,user}=await requireCrmUser(request);
    const body=await request.json() as {quoteId?:string;jobId?:string;paymentType?:"deposit"|"balance";channel?:"email"|"text";idempotencyKey?:string};
    if(!body.quoteId||!body.jobId||!["deposit","balance"].includes(String(body.paymentType))||!["email","text"].includes(String(body.channel))) throw new CrmAuthError(400,"Choose a valid customer, payment, and delivery method.");
    if(!body.idempotencyKey||!/^[0-9a-f]{8}-[0-9a-f-]{27,45}$/i.test(body.idempotencyKey)) throw new CrmAuthError(400,"A valid send request key is required.");
    const {data:quote}=await supabase.from("crm_quotes").select("id,job_id,customer_email,customer_phone").eq("id",body.quoteId).maybeSingle();
    if(!quote||quote.job_id!==body.jobId) throw new CrmAuthError(404,"The selected customer contract was not found.");
    const {data:job}=await supabase.from("crm_jobs").select("id,email,phone").eq("id",body.jobId).maybeSingle();
    if(!job) throw new CrmAuthError(404,"The selected customer record was not found.");
    const {data:prior}=await supabase.from("crm_activity_events").select("metadata").eq("entity_type","quote").eq("entity_id",body.quoteId).eq("action",`square_${body.paymentType}_link.send`).contains("metadata",{idempotencyKey:body.idempotencyKey}).maybeSingle();
    if(prior) return NextResponse.json({replayed:true,paymentType:body.paymentType});
    return NextResponse.json(await sendSquareOrderPaymentLink(supabase,body.quoteId,body.paymentType!,{email,userId:user.id},quote.customer_email||job.email,{channel:body.channel!,idempotencyKey:body.idempotencyKey,phone:quote.customer_phone||job.phone}));
  } catch(error){return crmAuthErrorResponse(error);}
}
