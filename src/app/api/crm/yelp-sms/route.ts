import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { listYelpSmsStatuses, sendCustomerYelpSms } from "@/lib/crm/yelp-sms";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    return NextResponse.json({ statuses: await listYelpSmsStatuses(supabase) });
  } catch (error) { return crmAuthErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const body: unknown = await request.json().catch(() => { throw new CrmAuthError(400, "A valid Yelp text request is required."); });
    return NextResponse.json(await sendCustomerYelpSms(supabase, body, { email, userId: user.id }));
  } catch (error) { return crmAuthErrorResponse(error); }
}
