import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { CUSTOMER_EMAIL_FIELDS, customerEmailActivation, getCustomerEmailMonitor } from "@/lib/crm/customer-email-monitor";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const jobId = request.nextUrl.searchParams.get("jobId");
    if (jobId && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(jobId)) return NextResponse.json({ message: "Invalid job." }, { status: 400 });
    const activation = await customerEmailActivation(supabase);
    if (!jobId) return NextResponse.json(await getCustomerEmailMonitor(supabase));
    const { data, error } = await supabase.from("crm_customer_signed_contract_email_outbox")
      .select(CUSTOMER_EMAIL_FIELDS).eq("job_id", jobId).order("created_at", { ascending: false }).limit(50);
    if (error) return NextResponse.json({ message: "Customer email status could not load." }, { status: 503 });
    return NextResponse.json({ messages: data, activation });
  } catch (error) { return crmAuthErrorResponse(error); }
}
