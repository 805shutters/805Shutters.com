import { validPaymentAmount, type CustomerPaymentChoice } from "@/lib/crm/customer-payment-request";
import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, CrmAuthError, requireCrmUser } from "@/lib/crm/auth";
import { loadCrmDashboardData } from "@/lib/crm/backend";
import { buildMobilePaymentQueue, filterMobilePaymentCustomers } from "@/lib/crm/mobile-payment-queue";
import { sendSquareOrderPaymentLink, SquarePaymentDeliveryError } from "@/lib/crm/square-payment-links";
import { toE164 } from "@/lib/notify/twilio";

type ContactRow = { email?: string | null; phone?: string | null; meta?: Record<string, unknown> | null };
type ContactPreference = { do_not_contact?: boolean | null; opted_out_at?: string | null } | null;

function flag(meta: Record<string, unknown> | null | undefined, ...keys: string[]) {
  return keys.some((key) => meta?.[key] === true);
}

export function mobilePaymentRecipient(input: {
  quote: ContactRow;
  job: ContactRow;
  channel: "email" | "text";
  preference?: ContactPreference;
}) {
  if (input.preference?.do_not_contact || input.preference?.opted_out_at) {
    throw new CrmAuthError(409, `The selected ${input.channel === "text" ? "phone" : "email"} is opted out or marked do not contact.`);
  }
  if (input.channel === "text") {
    if (flag(input.job.meta, "do_not_contact", "do_not_sms", "sms_opt_out", "sms_opted_out")) {
      throw new CrmAuthError(409, "The selected phone is opted out or marked do not contact.");
    }
    const quotePhone = toE164(input.quote.phone);
    const jobPhone = toE164(input.job.phone);
    if (input.quote.phone && !quotePhone) throw new CrmAuthError(400, "The contract phone is invalid.");
    if (input.job.phone && !jobPhone) throw new CrmAuthError(400, "The customer phone is invalid.");
    if (quotePhone && jobPhone && quotePhone !== jobPhone) throw new CrmAuthError(409, "Contract and customer phones do not exactly match.");
    if (!quotePhone && !jobPhone) throw new CrmAuthError(400, "No eligible customer phone is available.");
    return quotePhone || jobPhone as string;
  }
  if (flag(input.job.meta, "do_not_contact", "do_not_email", "email_opt_out", "email_opted_out")) {
    throw new CrmAuthError(409, "The selected email is opted out or marked do not contact.");
  }
  const quoteEmail = String(input.quote.email || "").trim().toLowerCase();
  const jobEmail = String(input.job.email || "").trim().toLowerCase();
  const valid = (value: string) => !value || (value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
  if (!valid(quoteEmail)) throw new CrmAuthError(400, "The contract email is invalid.");
  if (!valid(jobEmail)) throw new CrmAuthError(400, "The customer email is invalid.");
  if (quoteEmail && jobEmail && quoteEmail !== jobEmail) throw new CrmAuthError(409, "Contract and customer emails do not exactly match.");
  if (!quoteEmail && !jobEmail) throw new CrmAuthError(400, "No eligible customer email is available.");
  return quoteEmail || jobEmail;
}

export function maskedPaymentRecipient(channel: "email" | "text", recipient: string) {
  if (channel === "text") return `•••-•••-${recipient.slice(-4)}`;
  const [local, domain] = recipient.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

type PriorSendRequest = {quote_id:string;job_id:string;payment_type:string;channel:string;recipient:string;status:string;amount?:number|null;provider_status?:string|null;error_message?:string|null};
export function mobilePaymentReplay(prior:PriorSendRequest,input:{quoteId:string;jobId:string;paymentType:string;channel:string;recipient:string;expectedAmount?:number}) {
  if(prior.quote_id!==input.quoteId||prior.job_id!==input.jobId||prior.payment_type!==input.paymentType||prior.channel!==input.channel||prior.recipient!==input.recipient) throw new CrmAuthError(409,"This request key belongs to a different customer, order, amount type, channel, or recipient.");
  if (input.expectedAmount !== undefined && Number(prior.amount) !== input.expectedAmount) throw new CrmAuthError(409,"This request key belongs to a different payment amount.");
  if(prior.status!=="accepted") {
    const state=prior.status==="sending"?"unknown":prior.status;
    throw new CrmAuthError(409,prior.error_message||`The prior ${input.channel} attempt is ${state}. Review its audit record before a new send.`);
  }
  return {amount:prior.amount,providerStatus:prior.provider_status||"accepted"};
}

export async function GET(request:NextRequest) {
  try {
    const {supabase}=await requireCrmUser(request);
    const dashboard = await loadCrmDashboardData(supabase);
    const results = filterMobilePaymentCustomers(buildMobilePaymentQueue(dashboard),
      request.nextUrl.searchParams.get("q") || "", request.nextUrl.searchParams.get("letter") || "",
      request.nextUrl.searchParams.get("scope") || undefined);
    return NextResponse.json({results, asOf: new Date().toISOString()}, {headers: {"Cache-Control": "private, no-store"}});
  } catch(error){return crmAuthErrorResponse(error);}
}

export async function POST(request:NextRequest) {
  try {
    const {supabase,email,user}=await requireCrmUser(request);
    const body=await request.json() as {quoteId?:string;jobId?:string;paymentType?:"deposit"|"balance";channel?:"email"|"text";idempotencyKey?:string;expectedAmount?:number;expectedRecipient?:string;customAmount?:number;requestKind?:CustomerPaymentChoice;collectionMode?:"full"|"partial";expectedOutstanding?:number};
    if(!body.quoteId||!body.jobId||!["deposit","balance"].includes(String(body.paymentType))||!["email","text"].includes(String(body.channel))) throw new CrmAuthError(400,"Choose a valid customer, payment, and delivery method.");
    if (body.collectionMode !== undefined && !["full", "partial"].includes(body.collectionMode)) throw new CrmAuthError(400,"Choose full balance or partial payment.");
    if (body.collectionMode && body.paymentType !== "balance") throw new CrmAuthError(400,"Full and partial collections must use the order balance.");
    if (body.collectionMode !== undefined && body.requestKind !== undefined) throw new CrmAuthError(400,"Choose one payment amount mode.");
    if (body.requestKind !== undefined && (!["deposit","balance","full","custom"].includes(body.requestKind) || (body.requestKind === "deposit" ? "deposit" : "balance") !== body.paymentType)) throw new CrmAuthError(400,"Choose a valid payment amount and type.");
    if (body.customAmount !== undefined && ((body.requestKind !== "custom" && body.collectionMode !== "partial") || !validPaymentAmount(body.customAmount) || body.customAmount !== body.expectedAmount)) throw new CrmAuthError(400,"Review the specific payment amount before sending.");
    if (body.requestKind === "custom" && body.customAmount === undefined) throw new CrmAuthError(400,"Enter a specific payment amount.");
    if(!body.idempotencyKey||!/^[0-9a-f]{8}-[0-9a-f-]{27,45}$/i.test(body.idempotencyKey)) throw new CrmAuthError(400,"A valid send request key is required.");
    const {data:quote}=await supabase.from("crm_quotes").select("id,job_id,customer_email,customer_phone").eq("id",body.quoteId).maybeSingle();
    if(!quote||quote.job_id!==body.jobId) throw new CrmAuthError(404,"The selected customer contract was not found.");
    const {data:job}=await supabase.from("crm_jobs").select("id,email,phone,meta").eq("id",body.jobId).maybeSingle();
    if(!job) throw new CrmAuthError(404,"The selected customer record was not found.");
    const channel=body.channel!;
    const candidate=channel==="text"?toE164(quote.customer_phone||job.phone):String(quote.customer_email||job.email||"").trim().toLowerCase();
    let preference:ContactPreference=null;
    if(candidate){
      const preferenceResult=channel==="text"
        ?await supabase.from("crm_customer_sms_preferences").select("do_not_contact,opted_out_at").eq("phone_e164",candidate).maybeSingle()
        :await supabase.from("crm_customer_email_preferences").select("do_not_contact,opted_out_at").eq("email_normalized",candidate).maybeSingle();
      if(preferenceResult.error) throw new CrmAuthError(502,"Customer contact preferences could not be verified.");
      preference=preferenceResult.data as ContactPreference;
    }
    const recipient=mobilePaymentRecipient({quote:{email:quote.customer_email,phone:quote.customer_phone},job,channel,preference});
    if (typeof body.expectedRecipient !== "string" || !validPaymentAmount(body.expectedAmount)) {
      throw new CrmAuthError(400,"Review the current amount and recipient before sending.");
    }
    const expectedRecipient = channel === "text" ? toE164(body.expectedRecipient) : body.expectedRecipient.trim().toLowerCase();
    if (expectedRecipient !== recipient) throw new CrmAuthError(409,"The customer contact changed. Refresh and review the payment request again.");
    const maskedRecipient=maskedPaymentRecipient(channel,recipient);
    const requestRow={idempotency_key:body.idempotencyKey,quote_id:body.quoteId,job_id:body.jobId,actor_auth_user_id:user.id,actor_email:email,payment_type:body.paymentType,channel,recipient,amount:body.expectedAmount,status:"sending"};
    const claim=await supabase.from("crm_payment_link_send_requests").insert(requestRow);
    if(claim.error){
      if(claim.error.code!=="23505") throw new CrmAuthError(502,"The send request could not be safely reserved.");
      const {data:prior,error:priorError}=await supabase.from("crm_payment_link_send_requests").select("quote_id,job_id,payment_type,channel,recipient,status,amount,provider_status,error_message").eq("idempotency_key",body.idempotencyKey).maybeSingle();
      if(priorError||!prior) throw new CrmAuthError(502,"The prior send request could not be verified.");
      const replay=mobilePaymentReplay(prior,{quoteId:body.quoteId,jobId:body.jobId,paymentType:body.paymentType!,channel,recipient,expectedAmount:body.expectedAmount});
      return NextResponse.json({replayed:true,paymentType:body.paymentType,amount:replay.amount,channel,recipient:maskedRecipient,linkState:"created",deliveryState:"accepted",providerStatus:replay.providerStatus});
    }
    try{
      const result=await sendSquareOrderPaymentLink(supabase,body.quoteId,body.paymentType!,{email,userId:user.id},recipient,{channel,idempotencyKey:body.idempotencyKey,phone:recipient},{expectedAmount:body.expectedAmount!,expectedRecipient:recipient,...(body.collectionMode ? {collectionMode:body.collectionMode,expectedOutstanding:body.expectedOutstanding} : {}),...(body.requestKind ? {requestKind:body.requestKind} : {}),...(body.customAmount !== undefined ? {customAmount:body.customAmount} : {})});
      const update=await supabase.from("crm_payment_link_send_requests").update({updated_at:new Date().toISOString(),amount:result.amount,square_payment_link_id:result.linkId,square_payment_link_url:result.url,status:"accepted",provider_message_id:result.providerMessageId||null,provider_status:result.providerStatus||"accepted",error_message:null}).eq("idempotency_key",body.idempotencyKey).eq("status","sending");
      if(update.error) throw new Error("Provider accepted the request, but its audit status could not be finalized. Do not retry.");
      return NextResponse.json({paymentType:result.paymentType,amount:result.amount,remainingAfterPayment:result.remainingAfterPayment,channel,recipient:maskedRecipient,linkState:"created",deliveryState:"accepted",providerStatus:result.providerStatus||"accepted"});
    }catch(error){
      const deliveryError=error instanceof SquarePaymentDeliveryError?error:null;
      const status=deliveryError?.deliveryState||(error instanceof CrmAuthError?"failed":"unknown");
      const details=deliveryError?.details;
      await supabase.from("crm_payment_link_send_requests").update({updated_at:new Date().toISOString(),status,amount:details?.amount ?? body.expectedAmount,square_payment_link_id:details?.linkId||null,square_payment_link_url:details?.url||null,provider_message_id:details?.providerMessageId||null,provider_status:details?.providerStatus||null,error_message:error instanceof Error?error.message:"Payment link request failed."}).eq("idempotency_key",body.idempotencyKey).eq("status","sending");
      throw error;
    }
  } catch(error){return crmAuthErrorResponse(error);}
}
